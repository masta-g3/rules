#!/usr/bin/env python3

import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
AUTOPILOT = REPO_ROOT / "experimental" / "autopilot"


class WorkflowReferencesTest(unittest.TestCase):
    def test_autopilot_starts_at_planning(self) -> None:
        source = (AUTOPILOT / "scripts" / "start_workflow.sh").read_text()

        self.assertIn('--arg next "/plan-md"', source)

    def test_worktree_guidance_uses_external_exact_records(self) -> None:
        files = [
            REPO_ROOT / "skills/plan-md/SKILL.md",
            REPO_ROOT / "skills/execute/SKILL.md",
            REPO_ROOT / "skills/commit/SKILL.md",
            REPO_ROOT / "skills/workflow-orchestrator/SKILL.md",
            REPO_ROOT / "skills/workflow-orchestrator/references/parallel-worktrees.md",
        ]
        combined = "\n".join(path.read_text() for path in files)
        self.assertIn("AGENT_WORKTREES_DIR", combined)
        self.assertIn("worktrees.sh remove", combined)
        self.assertNotIn("git worktree add agent-work/worktrees", combined)
        self.assertNotIn("Ensure `agent-work/worktrees/` is gitignored", combined)
        self.assertNotIn("`worktrees.sh", combined)

    def test_autopilot_routes_reflection_before_commit(self) -> None:
        reference = (AUTOPILOT / "WORKFLOW.md").read_text()
        hook = (AUTOPILOT / "scripts" / "workflow_hook.sh").read_text()

        self.assertIn("| review | `/reflect`", reference)
        self.assertIn("| reflect | `/commit`", reference)
        self.assertIn("/execute|/review|/reflect|/commit", hook)


if __name__ == "__main__":
    unittest.main()
