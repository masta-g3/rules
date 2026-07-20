#!/usr/bin/env python3

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
SYNC_PROMPTS = REPO_ROOT / "sync-prompts.sh"


class SyncPromptsTest(unittest.TestCase):
    def test_claude_and_cursor_subagents_do_not_receive_gpt_provider_config(self) -> None:
        source = SYNC_PROMPTS.read_text()

        self.assertIn("sync_sanitized_subagents()", source)
        self.assertIn('model:[[:space:]]*openai-codex', source)
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
