#!/usr/bin/env python3

import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
EXTENSION = REPO_ROOT / "extensions" / "workflow-indicator.ts"


class PiExtensionImportsTest(unittest.TestCase):
    def test_workflow_indicator_uses_current_pi_packages(self) -> None:
        source = EXTENSION.read_text()

        self.assertIn('from "@earendil-works/pi-coding-agent"', source)
        self.assertIn('from "@earendil-works/pi-tui"', source)
        self.assertNotIn("@mariozechner/pi-coding-agent", source)
        self.assertNotIn("@mariozechner/pi-tui", source)

    def test_workflow_indicator_exposes_ticket_tool(self) -> None:
        source = EXTENSION.read_text()

        self.assertIn('import { Type } from "typebox";', source)
        self.assertIn('pi.registerTool({', source)
        self.assertIn('name: "set_workflow_ticket"', source)
        self.assertIn('ticketId: Type.String', source)
        self.assertIn('source?: "input" | "command" | "shortcut" | "tool";', source)
        self.assertIn('source: "tool"', source)


if __name__ == "__main__":
    unittest.main()
