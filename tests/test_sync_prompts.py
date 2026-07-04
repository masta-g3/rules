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

            self.assertNotIn("openai-codex/gpt-5.5", claude_agent.read_text())
            self.assertNotIn("thinking: high", claude_agent.read_text())
            self.assertIn("openai-codex/gpt-5.5", pi_agent.read_text())
            self.assertIn("thinking: high", pi_agent.read_text())


if __name__ == "__main__":
    unittest.main()
