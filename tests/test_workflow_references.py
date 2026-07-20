#!/usr/bin/env python3

import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
AUTOPILOT = REPO_ROOT / "experimental" / "autopilot"


class WorkflowReferencesTest(unittest.TestCase):
    def test_autopilot_starts_at_planning(self) -> None:
        source = (AUTOPILOT / "scripts" / "start_workflow.sh").read_text()

        self.assertIn('--arg next "/plan-md"', source)

    def test_autopilot_routes_reflection_before_commit(self) -> None:
        reference = (AUTOPILOT / "WORKFLOW.md").read_text()
        hook = (AUTOPILOT / "scripts" / "workflow_hook.sh").read_text()

        self.assertIn("| review | `/reflect`", reference)
        self.assertIn("| reflect | `/commit`", reference)
        self.assertIn("/execute|/review|/reflect|/commit", hook)


if __name__ == "__main__":
    unittest.main()
