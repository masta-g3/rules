#!/usr/bin/env python3

import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
NODE_TEST = REPO_ROOT / "tests" / "workflow_runtime.test.mjs"
EXTENSION_TEST = REPO_ROOT / "tests" / "workflow_runtime_extension.test.mjs"
GLOBAL_NODE_MODULES = Path(subprocess.run(["npm", "root", "-g"], capture_output=True, text=True, check=True).stdout.strip())
PI_PACKAGE = GLOBAL_NODE_MODULES / "@earendil-works" / "pi-coding-agent"


class WorkflowRuntimeTest(unittest.TestCase):
    def test_runtime_behavior(self) -> None:
        result = subprocess.run(
            ["node", "--experimental-strip-types", "--test", str(NODE_TEST)],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_runtime_extension_lifecycle(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            shutil.copytree(REPO_ROOT / "extensions" / "workflow-runtime", root / "extensions" / "workflow-runtime")
            (root / "tests").mkdir()
            shutil.copy2(EXTENSION_TEST, root / "tests" / EXTENSION_TEST.name)
            scope = root / "node_modules" / "@earendil-works"
            scope.mkdir(parents=True)
            for package in ("pi-coding-agent", "pi-ai", "pi-tui"):
                target = PI_PACKAGE if package == "pi-coding-agent" else PI_PACKAGE / "node_modules" / "@earendil-works" / package
                (scope / package).symlink_to(target, target_is_directory=True)
            (root / "node_modules" / "typebox").symlink_to(PI_PACKAGE / "node_modules" / "typebox", target_is_directory=True)

            result = subprocess.run(
                ["node", "--experimental-strip-types", "--test", str(root / "tests" / EXTENSION_TEST.name)],
                cwd=root,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
