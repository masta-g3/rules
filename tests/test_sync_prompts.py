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
    def test_claude_subagents_do_not_receive_gpt_provider_config(self) -> None:
        source = SYNC_PROMPTS.read_text()

        self.assertIn("sync_claude_subagents()", source)
        self.assertIn('model:[[:space:]]*openai-codex', source)
        self.assertIn('sync_claude_subagents "${repo_root}/agents/" "${claude_root}/agents/"', source)
        self.assertNotIn('sync_dir "${repo_root}/agents/" "${claude_root}/agents/" "subagents"', source)

    def test_sync_sanitizes_claude_subagents_but_leaves_pi_provider_config(self) -> None:
        if not shutil.which("rsync") or not shutil.which("jq"):
            self.skipTest("sync-prompts.sh dependencies are unavailable")

        with tempfile.TemporaryDirectory() as home:
            env = {**os.environ, "HOME": home}
            subprocess.run([str(SYNC_PROMPTS), "--silent"], cwd=REPO_ROOT, env=env, check=True)

            claude_agent = Path(home) / ".claude" / "agents" / "code-critic.md"
            pi_agent = Path(home) / ".pi" / "agent" / "agents" / "code-critic.md"

            self.assertNotIn("openai-codex/gpt-5.6-sol", claude_agent.read_text())
            self.assertNotIn("thinking: high", claude_agent.read_text())
            self.assertIn("openai-codex/gpt-5.6-sol", pi_agent.read_text())
            self.assertNotIn("openai-codex/gpt-5.5", pi_agent.read_text())
            self.assertIn("thinking: high", pi_agent.read_text())

    def test_extension_sync_migrates_legacy_runtime_without_deleting_user_extensions(self) -> None:
        if not shutil.which("rsync") or not shutil.which("jq"):
            self.skipTest("sync-prompts.sh dependencies are unavailable")

        for clean_arg in ([], ["--clean"]):
            with self.subTest(mode="clean" if clean_arg else "default"), tempfile.TemporaryDirectory() as home:
                extensions = Path(home) / ".pi" / "agent" / "extensions"
                extensions.mkdir(parents=True)
                (extensions / "workflow-indicator.ts").write_text("legacy indicator")
                (extensions / "long-execute.ts").write_text("legacy controller")
                (extensions / "user-extension.ts").write_text("keep me")

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


if __name__ == "__main__":
    unittest.main()
