import json
import os
import shutil
import subprocess
import tempfile
import tomllib
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


class SharedSyncTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.repo = root / "repo"
        self.repo.mkdir()
        for name in ("sync-prompts.sh", "AGENTS.md"):
            shutil.copy2(REPO / name, self.repo / name)
        for name in ("bin", "prompts", "skills", "pi", "agents", "extensions", "statusline"):
            if (REPO / name).exists():
                shutil.copytree(REPO / name, self.repo / name)
        self.home = root / "home"
        self.home.mkdir()
        self.env = {**os.environ, "HOME": str(self.home), "CODEX_HOME": str(self.home / ".codex")}
        self.shared = self.home / ".agents/skills"
        self.claude = self.home / ".claude/skills"

    def sync(self, success=True):
        result = subprocess.run([str(self.repo / "sync-prompts.sh"), "--silent"],
                                cwd=self.repo, env=self.env, capture_output=True, text=True)
        if success:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result

    def test_shared_install_and_native_formats(self):
        for _ in range(2):
            self.sync()
            for source in (self.repo / "skills").iterdir():
                if not source.is_dir() or source.name.startswith("."):
                    continue
                self.assertTrue((self.shared / source.name).is_dir())
                link = self.claude / source.name
                self.assertTrue(link.is_symlink())
                self.assertEqual(link.resolve(), (self.shared / source.name).resolve())
                for root in (".cursor", ".codex", ".pi/agent"):
                    self.assertFalse((self.home / root / "skills" / source.name).exists())
            self.assertTrue((self.shared / "_lib/features_yaml.sh").is_file())
            self.assertFalse((self.shared / "workflow-orchestrator").exists())
            self.assertTrue((self.home / ".pi/agent/skills/workflow-orchestrator/SKILL.md").is_file())
            self.assertFalse((self.claude / "workflow-orchestrator").exists())

            template = (self.repo / "prompts/AGENTS.md").read_text()
            for path in (".claude/CLAUDE.md", ".pi/agent/AGENTS.md", ".codex/AGENTS.md"):
                self.assertEqual((self.home / path).read_text(), template)
            rule = (self.home / ".cursor/rules/rules.mdc").read_text()
            self.assertEqual(rule, "---\nalwaysApply: true\n---\n\n" + template)
            self.assertFalse((self.home / ".cursor/AGENTS.md").exists())

            codex_prompt = self.home / ".codex/skills/answer-style"
            cursor_prompt = self.home / ".cursor/skills/answer-style"
            self.assertTrue(cursor_prompt.is_symlink())
            self.assertEqual(cursor_prompt.resolve(), codex_prompt.resolve())
            self.assertIn("allow_implicit_invocation: false", (codex_prompt / "agents/openai.yaml").read_text())
            self.assertFalse((self.shared / "answer-style").exists())
            for path in (".claude/commands/answer-style.md", ".pi/agent/prompts/answer-style.md"):
                self.assertEqual((self.home / path).read_text(), (self.repo / "prompts/answer-style.md").read_text())

            for name in ("code-critic", "plan-critic", "docs-critic", "frontend-designer", "second-opinion"):
                agent = tomllib.loads((self.home / f".codex/agents/{name}.toml").read_text())
                self.assertEqual(agent["name"], name)
                body = (self.repo / f"agents/{name}.md").read_text().split("---", 2)[2].strip()
                self.assertEqual(agent["developer_instructions"], body)
                self.assertNotIn("model", agent)
                if name != "second-opinion":
                    self.assertEqual(agent["sandbox_mode"], "read-only")
                    self.assertIn("readonly: true", (self.home / f".cursor/agents/{name}.md").read_text())
            self.assertFalse((self.home / ".codex/config.toml").exists())

    def test_migrates_managed_copies_and_preserves_personal_files(self):
        for root in (".claude", ".cursor", ".codex", ".pi/agent"):
            target = self.home / root / "skills"
            source = self.repo / "skills/execute"
            shutil.copytree(source, target / "execute")
            (target / "personal").mkdir()
            (target / "personal/SKILL.md").write_text("personal skill")
            shutil.copytree(self.repo / "pi/skills/workflow-orchestrator", target / "workflow-orchestrator")
            entries = "execute\nworkflow-orchestrator\n" if root == ".cursor" else "execute/SKILL.md\nworkflow-orchestrator/SKILL.md\nworkflow-orchestrator/references/parallel-worktrees.md\n"
            (target / ".rules-manifest-skills").write_text(entries)
        pi_settings = self.home / ".pi/agent/settings.json"
        pi_settings.write_text(json.dumps({"skills": ["~/.claude/skills", "~/.pi/agent/skills", "/personal/skills"], "theme": "keep"}))
        self.sync()
        self.sync()
        for root in (".claude", ".cursor", ".codex", ".pi/agent"):
            self.assertEqual((self.home / root / "skills/personal/SKILL.md").read_text(), "personal skill")
        self.assertTrue((self.claude / "execute").is_symlink())
        for root in (".claude", ".cursor", ".codex"):
            self.assertFalse((self.home / root / "skills/workflow-orchestrator").exists())
        self.assertTrue((self.home / ".pi/agent/skills/workflow-orchestrator/SKILL.md").exists())
        settings = json.loads(pi_settings.read_text())
        self.assertEqual(settings["skills"], ["/personal/skills"])
        self.assertEqual(settings["theme"], "keep")

    def test_conflicting_personal_files_stop_before_install(self):
        for location in (".claude/skills/execute/personal.md", ".agents/skills/execute/SKILL.md"):
            with self.subTest(location=location):
                path = self.home / location
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("mine")
                result = self.sync(success=False)
                self.assertIn(str(path), result.stderr)
                self.assertEqual(path.read_text(), "mine")
                self.assertFalse((self.home / ".codex/AGENTS.md").exists())
                path.unlink()
                path.parent.rmdir()

    def test_prunes_removed_skills_prompts_and_agents_without_following_links(self):
        self.sync()
        personal = self.shared / "execute/personal.md"
        personal.write_text("keep")
        shutil.rmtree(self.repo / "skills/execute")
        (self.repo / "prompts/answer-style.md").unlink()
        (self.repo / "agents/code-critic.md").unlink()
        self.sync()
        self.sync()
        self.assertFalse((self.claude / "execute").is_symlink())
        self.assertEqual(personal.read_text(), "keep")
        self.assertFalse((self.shared / "execute/SKILL.md").exists())
        self.assertFalse((self.home / ".cursor/skills/answer-style").is_symlink())
        self.assertFalse((self.home / ".codex/skills/answer-style/SKILL.md").exists())
        self.assertFalse((self.home / ".codex/agents/code-critic.toml").exists())

    def test_refuses_cleanup_through_replaced_directory_symlink(self):
        self.sync()
        outside = self.home / "personal-files"
        outside.mkdir()
        sentinel = outside / "SKILL.md"
        sentinel.write_text("keep")
        shutil.rmtree(self.shared / "execute")
        (self.shared / "execute").symlink_to(outside)
        shutil.rmtree(self.repo / "skills/execute")
        result = self.sync(success=False)
        self.assertIn("Refusing to retire files through symlink", result.stderr)
        self.assertEqual(sentinel.read_text(), "keep")

    def test_empty_personal_directory_blocks_link_before_migration(self):
        target = self.claude / "execute"
        shutil.copytree(self.repo / "skills/execute", target)
        (target / "personal-empty").mkdir()
        (self.claude / ".rules-manifest-skills").write_text("execute/SKILL.md\n")
        result = self.sync(success=False)
        self.assertIn("Personal directory", result.stderr)
        self.assertTrue((target / "SKILL.md").exists())
        self.assertFalse((self.home / ".codex/AGENTS.md").exists())

    def test_codex_home_override(self):
        self.env["CODEX_HOME"] = str(self.home / "codex-profile")
        self.sync()
        self.assertTrue((self.home / "codex-profile/AGENTS.md").is_file())
        self.assertTrue((self.home / "codex-profile/agents/code-critic.toml").is_file())
        self.assertEqual((self.home / ".cursor/skills/answer-style").resolve(), (self.home / "codex-profile/skills/answer-style").resolve())
        self.assertFalse((self.home / ".codex").exists())
