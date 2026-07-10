#!/usr/bin/env python3

import subprocess
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
NODE_TEST = REPO_ROOT / "tests" / "workflow_runtime.test.mjs"


class WorkflowRuntimeTest(unittest.TestCase):
    def test_runtime_behavior(self) -> None:
        result = subprocess.run(
            ["node", "--experimental-strip-types", "--test", str(NODE_TEST)],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
