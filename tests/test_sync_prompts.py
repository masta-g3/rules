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
        helpers = SYNC_PROMPTS.read_text().split('remove_path "${codex_root}/AGENTS.md"', 1)[0]
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

    def test_claude_and_cursor_subagents_do_not_receive_gpt_provider_config(self) -> None:
        source = SYNC_PROMPTS.read_text()

        self.assertIn("sync_sanitized_subagents()", source)
        self.assertIn('model:[[:space:]]*(openai-codex|claude-bridge)', source)
        self.assertIn('sync_sanitized_subagents "${repo_root}/agents/" "${claude_root}/agents/"', source)
        self.assertIn('sync_sanitized_subagents "${repo_root}/agents/" "${cursor_root}/agents/"', source)
        self.assertNotIn('sync_dir "${repo_root}/agents/" "${claude_root}/agents/" "subagents"', source)
        self.assertNotIn('sync_dir "${repo_root}/agents/" "${cursor_root}/agents/" "subagents"', source)

    def test_sync_sanitizes_claude_subagents_but_leaves_pi_provider_config(self) -> None:
        if not shutil.which("rsync") or not shutil.which("jq"):
            self.skipTest("sync-prompts.sh dependencies are unavailable")

        with tempfile.TemporaryDirectory() as home:
            env = {**os.environ, "HOME": home}
            subprocess.run([str(SYNC_PROMPTS), "--silent"], cwd=REPO_ROOT, env=env, check=True)

            claude_agent = Path(home) / ".claude" / "agents" / "code-critic.md"
            cursor_agent = Path(home) / ".cursor" / "agents" / "code-critic.md"
            pi_agent = Path(home) / ".pi" / "agent" / "agents" / "code-critic.md"

            pi_text = pi_agent.read_text()

            for sanitized in (claude_agent.read_text(), cursor_agent.read_text()):
                self.assertNotIn("openai-codex/gpt-5.6-sol", sanitized)
                self.assertNotIn("thinking: high", sanitized)
                self.assertIn("tools: Read, Grep, Glob, Bash", sanitized)
                self.assertNotIn("tools: read, grep, find, bash", sanitized)
            self.assertIn("openai-codex/gpt-5.6-sol", pi_text)
            self.assertNotIn("openai-codex/gpt-5.5", pi_text)
            self.assertIn("thinking: high", pi_text)
            self.assertIn("tools: read, grep, find, bash", pi_text)

    def test_shared_specialists_migrate_from_pi_only_manifest(self) -> None:
        if not shutil.which("rsync") or not shutil.which("jq"):
            self.skipTest("sync dependencies are unavailable")
        with tempfile.TemporaryDirectory() as home:
            root = Path(home)
            pi_agents = root / ".pi" / "agent" / "agents"
            pi_agents.mkdir(parents=True)
            legacy = pi_agents / ".rules-manifest-pi_subagents"
            legacy.write_text("frontend-designer.md\nsecond-opinion.md\n")
            (pi_agents / "personal.md").write_text("keep")
            for _ in range(2):
                subprocess.run([str(SYNC_PROMPTS), "--silent"], cwd=REPO_ROOT,
                               env={**os.environ, "HOME": home}, check=True)
                self.assertFalse(legacy.exists())
                self.assertEqual((pi_agents / "personal.md").read_text(), "keep")
                for name in ("frontend-designer", "second-opinion"):
                    original = (REPO_ROOT / "agents" / f"{name}.md").read_text()
                    self.assertEqual((pi_agents / f"{name}.md").read_text(), original)
                    self.assertIn("model: claude-bridge/claude-opus-5", original)
                    self.assertIn(f"{name}.md", (pi_agents / ".rules-manifest-subagents").read_text())
                    for harness in (".claude", ".cursor"):
                        text = (root / harness / "agents" / f"{name}.md").read_text()
                        for field in ("model:", "thinking:", "systemPromptMode:", "inheritProjectContext:", "inheritSkills:"):
                            self.assertNotIn(field, text)
                        self.assertNotIn("Opus 5 delegate", text)
                        if name == "frontend-designer":
                            self.assertIn("tools: Read, Grep, Glob, LS", text)

    def test_manifest_prunes_stale_repo_skills_but_keeps_user_skills(self) -> None:
        if not shutil.which("rsync") or not shutil.which("jq"):
            self.skipTest("sync-prompts.sh dependencies are unavailable")

        with tempfile.TemporaryDirectory() as home:
            claude_skills = Path(home) / ".claude" / "skills"
            (claude_skills / "workflow-migrate").mkdir(parents=True)
            (claude_skills / "workflow-migrate" / "SKILL.md").write_text("stale seeded skill")
            (claude_skills / "user-skill").mkdir()
            (claude_skills / "user-skill" / "SKILL.md").write_text("mine")

            env = {**os.environ, "HOME": home}
            subprocess.run([str(SYNC_PROMPTS), "--silent"], cwd=REPO_ROOT, env=env, check=True)

            manifest = claude_skills / ".rules-manifest-skills"
            self.assertFalse((claude_skills / "workflow-migrate").exists())
            self.assertEqual((claude_skills / "user-skill" / "SKILL.md").read_text(), "mine")
            self.assertIn("plan-md", manifest.read_text())
            self.assertNotIn("user-skill", manifest.read_text())

            # A manifest entry whose source disappears from the repo is pruned on the next run.
            (claude_skills / "old-thing").mkdir()
            (claude_skills / "old-thing" / "SKILL.md").write_text("previously synced")
            manifest.write_text(manifest.read_text() + "old-thing\n")
            subprocess.run([str(SYNC_PROMPTS), "--silent"], cwd=REPO_ROOT, env=env, check=True)

            self.assertFalse((claude_skills / "old-thing").exists())
            self.assertEqual((claude_skills / "user-skill" / "SKILL.md").read_text(), "mine")
            self.assertNotIn("old-thing", manifest.read_text())

    def test_extension_sync_migrates_legacy_runtime_without_deleting_user_extensions(self) -> None:
        if not shutil.which("rsync") or not shutil.which("jq"):
            self.skipTest("sync-prompts.sh dependencies are unavailable")

        for clean_arg in ([], ["--clean"]):
            with self.subTest(mode="clean" if clean_arg else "default"), tempfile.TemporaryDirectory() as home:
                pi_root = Path(home) / ".pi" / "agent"
                extensions = pi_root / "extensions"
                extensions.mkdir(parents=True)
                (extensions / "workflow-indicator.ts").write_text("legacy indicator")
                (extensions / "long-execute.ts").write_text("legacy controller")
                (extensions / "user-extension.ts").write_text("keep me")
                old_skill = pi_root / "skills" / "long-execute"
                old_skill.mkdir(parents=True)
                (old_skill / "SKILL.md").write_text("legacy skill")

                env = {**os.environ, "HOME": home}
                subprocess.run(
                    [str(SYNC_PROMPTS), "--silent", *clean_arg],
                    cwd=REPO_ROOT,
                    env=env,
                    check=True,
                )

                self.assertTrue((extensions / "workflow-runtime" / "index.ts").is_file())
                self.assertTrue((extensions / "workflow-runtime" / "core.ts").is_file())
                self.assertFalse((extensions / "workflow-indicator.ts").exists())
                self.assertFalse((extensions / "long-execute.ts").exists())
                self.assertEqual((extensions / "user-extension.ts").read_text(), "keep me")
                self.assertTrue((pi_root / "skills" / "focus" / "SKILL.md").is_file())
                self.assertFalse(old_skill.exists())


if __name__ == "__main__":
    unittest.main()
