#!/usr/bin/env python3

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
SYNC_PROMPTS = REPO_ROOT / "sync-prompts.sh"


class SyncPromptsTest(unittest.TestCase):
    def test_package_sync_respects_local_install(self) -> None:
        if not shutil.which("jq"):
            self.skipTest("jq is unavailable")
        helpers = SYNC_PROMPTS.read_text().split("# Prepare and check every new destination", 1)[0]
        for source_kind in ("relative", "absolute", "object", "missing"):
            with self.subTest(source=source_kind), tempfile.TemporaryDirectory() as home:
                root = Path(home)
                pi_root = root / ".pi" / "agent"
                pi_root.mkdir(parents=True)
                package = root / "dev" / "subagents"
                package.mkdir(parents=True)
                (package / "package.json").write_text(json.dumps({"name": "pi-tmux-subagents"}))
                source = "../../dev/subagents" if source_kind == "relative" else str(package)
                entry = {"source": source} if source_kind == "object" else source
                packages = [] if source_kind == "missing" else [entry]
                settings = pi_root / "settings.json"
                settings.write_text(json.dumps({"packages": packages, "theme": "keep"}))
                script = root / "check.sh"
                script.write_text(helpers + '\nensure_pi_package "npm:pi-tmux-subagents"\n')
                for _ in range(2):
                    subprocess.run(["bash", str(script)], env={**os.environ, "HOME": home}, check=True, capture_output=True)
                result = json.loads(settings.read_text())
                expected = ["npm:pi-tmux-subagents"] if source_kind == "missing" else packages
                self.assertEqual(result["packages"], expected)
                self.assertEqual(result["theme"], "keep")

    def test_sync_sanitizes_subagents_but_leaves_pi_provider_config(self) -> None:
        with tempfile.TemporaryDirectory() as home:
            subprocess.run([str(SYNC_PROMPTS), "--silent"], cwd=REPO_ROOT,
                           env={**os.environ, "HOME": home, "CODEX_HOME": home + "/.codex"}, check=True)
            root = Path(home)
            claude = (root / ".claude/agents/code-critic.md").read_text()
            cursor = (root / ".cursor/agents/code-critic.md").read_text()
            pi = (root / ".pi/agent/agents/code-critic.md").read_text()
            for text in (claude, cursor):
                self.assertNotIn("openai-codex/gpt-5.6-sol", text)
                self.assertNotIn("thinking: high", text)
                self.assertNotIn("tools: read, grep, find, bash", text)
            self.assertIn("tools: Read, Grep, Glob, Bash", claude)
            self.assertIn("readonly: true", cursor)
            self.assertIn("openai-codex/gpt-5.6-sol", pi)
            self.assertIn("thinking: high", pi)
            self.assertIn("tools: read, grep, find, bash", pi)

    def test_shared_specialists_migrate_from_pi_only_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as home:
            root = Path(home)
            pi_agents = root / ".pi/agent/agents"
            pi_agents.mkdir(parents=True)
            legacy = pi_agents / ".rules-manifest-pi_subagents"
            legacy.write_text("frontend-designer.md\nsecond-opinion.md\n")
            (pi_agents / "personal.md").write_text("keep")
            for _ in range(2):
                subprocess.run([str(SYNC_PROMPTS), "--silent"], cwd=REPO_ROOT,
                               env={**os.environ, "HOME": home, "CODEX_HOME": home + "/.codex"}, check=True)
                self.assertFalse(legacy.exists())
                self.assertEqual((pi_agents / "personal.md").read_text(), "keep")
                for name in ("frontend-designer", "second-opinion"):
                    original = (REPO_ROOT / "agents" / f"{name}.md").read_text()
                    self.assertEqual((pi_agents / f"{name}.md").read_text(), original)
                    self.assertIn(f"{name}.md", (pi_agents / ".rules-manifest-subagents").read_text())
                    for harness in (".claude", ".cursor"):
                        text = (root / harness / "agents" / f"{name}.md").read_text()
                        for field in ("model:", "thinking:", "systemPromptMode:", "inheritProjectContext:", "inheritSkills:"):
                            self.assertNotIn(field, text)
                        if name == "frontend-designer":
                            expected = "tools: Read, Grep, Glob, LS" if harness == ".claude" else "readonly: true"
                            self.assertIn(expected, text)

    def test_manifest_prunes_stale_repo_skills_but_keeps_user_skills(self) -> None:
        with tempfile.TemporaryDirectory() as home:
            claude_skills = Path(home) / ".claude/skills"
            (claude_skills / "workflow-migrate").mkdir(parents=True)
            (claude_skills / "workflow-migrate/SKILL.md").write_text("stale managed skill")
            manifest = claude_skills / ".rules-manifest-skills"
            manifest.write_text("workflow-migrate/SKILL.md\n")
            (claude_skills / "user-skill").mkdir()
            (claude_skills / "user-skill/SKILL.md").write_text("mine")
            env = {**os.environ, "HOME": home, "CODEX_HOME": home + "/.codex"}
            subprocess.run([str(SYNC_PROMPTS), "--silent"], cwd=REPO_ROOT, env=env, check=True)
            self.assertFalse((claude_skills / "workflow-migrate").exists())
            self.assertEqual((claude_skills / "user-skill/SKILL.md").read_text(), "mine")
            self.assertIn("plan-md", (claude_skills / ".rules-manifest-skill_links").read_text())
            self.assertNotIn("user-skill", manifest.read_text())
            (claude_skills / "old-thing").mkdir()
            (claude_skills / "old-thing/SKILL.md").write_text("previously synced")
            manifest.write_text("old-thing/SKILL.md\n")
            subprocess.run([str(SYNC_PROMPTS), "--silent"], cwd=REPO_ROOT, env=env, check=True)
            self.assertFalse((claude_skills / "old-thing").exists())
            self.assertEqual((claude_skills / "user-skill/SKILL.md").read_text(), "mine")

    def test_recursive_manifest_cleanup_and_migration(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src, dst = root / "source", root / "target"
            (src / "skill/assets").mkdir(parents=True)
            (src / "skill/SKILL.md").write_text("current")
            (src / "skill/assets/old.html").write_text("asset")
            (dst / "skill").mkdir(parents=True)
            (dst / "skill/local.md").write_text("mine")
            manifest = dst / ".rules-manifest-test"
            manifest.write_text("skill\n")
            helpers = SYNC_PROMPTS.read_text().split("ensure_pi_setting_array_value()", 1)[0]
            script = root / "sync.sh"
            script.write_text(helpers + '\nprune_and_record "$SRC/" "$DST/" test\nsync_dir "$SRC/" "$DST/" test\n')
            env = {**os.environ, "HOME": tmp, "SRC": str(src), "DST": str(dst)}

            def sync():
                result = subprocess.run(["bash", str(script)], env=env, capture_output=True, text=True, check=True)
                self.assertEqual(result.stderr, "")

            sync()
            self.assertIn("skill/assets/old.html", manifest.read_text())
            self.assertNotIn("local.md", manifest.read_text())
            (src / "skill/assets/old.html").unlink()
            (src / "skill/assets").rmdir()
            sync()
            self.assertFalse((dst / "skill/assets").exists())
            self.assertEqual((dst / "skill/local.md").read_text(), "mine")
            shutil.rmtree(src)
            sync()
            self.assertFalse((dst / "skill/SKILL.md").exists())
            self.assertEqual((dst / "skill/local.md").read_text(), "mine")
            self.assertEqual(manifest.read_text(), "")
            sync()

    def test_extension_sync_migrates_legacy_runtime_without_deleting_user_extensions(self) -> None:
        for clean_arg in ([], ["--clean"]):
            with self.subTest(mode=clean_arg), tempfile.TemporaryDirectory() as home:
                pi_root = Path(home) / ".pi/agent"
                extensions = pi_root / "extensions"
                extensions.mkdir(parents=True)
                (extensions / "workflow-indicator.ts").write_text("legacy indicator")
                (extensions / "long-execute.ts").write_text("legacy controller")
                (extensions / "user-extension.ts").write_text("keep me")
                old_skill = pi_root / "skills/long-execute"
                old_skill.mkdir(parents=True)
                (old_skill / "SKILL.md").write_text("legacy skill")
                subprocess.run([str(SYNC_PROMPTS), "--silent", *clean_arg], cwd=REPO_ROOT,
                               env={**os.environ, "HOME": home, "CODEX_HOME": home + "/.codex"}, check=True)
                self.assertTrue((extensions / "workflow-runtime/index.ts").is_file())
                self.assertTrue((extensions / "workflow-runtime/core.ts").is_file())
                self.assertFalse((extensions / "workflow-indicator.ts").exists())
                self.assertFalse((extensions / "long-execute.ts").exists())
                self.assertEqual((extensions / "user-extension.ts").read_text(), "keep me")
                self.assertFalse((pi_root / "skills/focus").exists())
                self.assertFalse(old_skill.exists())


if __name__ == "__main__":
    unittest.main()
