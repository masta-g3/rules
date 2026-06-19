#!/usr/bin/env python3

import unittest
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parent.parent
EXTENSION = REPO_ROOT / "extensions" / "workflow-indicator.ts"
SKILL_THINKING_EXTENSION = REPO_ROOT / "extensions" / "skill-thinking.ts"
NOTIFY_EXTENSION = REPO_ROOT / "extensions" / "notify.ts"
EXPECTED_SKILL_THINKING = {
    "commit": "low",
    "docs-health": "high",
    "epic-init": "high",
    "execute": "medium",
    "explain-html": "high",
    "next-feature": "minimal",
    "plan-md": "high",
    "prime": "low",
    "project-init": "high",
    "reflect": "medium",
    "review": "high",
    "test-coverage": "high",
    "ticket-init": "medium",
    "workflow-migrate": "medium",
    "workflow-orchestrator": "medium",
}
VALID_THINKING_LEVELS = {"off", "minimal", "low", "medium", "high", "xhigh"}


def read_skill_frontmatter(skill_name: str) -> dict:
    source = (REPO_ROOT / "skills" / skill_name / "SKILL.md").read_text()
    if not source.startswith("---\n"):
        raise AssertionError(f"{skill_name} is missing frontmatter")
    frontmatter = source.split("---", 2)[1]
    return yaml.safe_load(frontmatter) or {}


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

    def test_skill_thinking_uses_current_pi_packages(self) -> None:
        source = SKILL_THINKING_EXTENSION.read_text()

        self.assertIn('from "@earendil-works/pi-coding-agent"', source)
        self.assertIn("ExtensionAPI", source)
        self.assertNotIn("@mariozechner/pi-coding-agent", source)
        self.assertNotIn("@mariozechner/pi-tui", source)

    def test_notify_uses_current_pi_package_and_macos_sound(self) -> None:
        source = NOTIFY_EXTENSION.read_text()

        self.assertIn('from "@earendil-works/pi-coding-agent"', source)
        self.assertNotIn("@mariozechner/pi-coding-agent", source)
        self.assertIn('pi.on("agent_end"', source)
        self.assertIn('pi.registerCommand("notify-test"', source)
        self.assertIn("display notification", source)
        self.assertIn("afplay", source)
        self.assertIn("sessionBody", source)
        self.assertIn("basename(ctx.cwd)", source)
        self.assertIn("sessionName(pi, ctx)", source)
        self.assertIn('`${project} - ${sessionName(pi, ctx)}`', source)
        self.assertIn('function notificationTitle(status: string): string', source)
        self.assertIn('return `Pi ${status}`', source)
        self.assertIn('notify(notificationTitle(READY), sessionBody(pi, ctx))', source)
        self.assertIn('notify(notificationTitle(TEST), sessionBody(pi, ctx))', source)
        self.assertNotIn("Model:", source)

    def test_skill_thinking_sets_and_restores_level(self) -> None:
        source = SKILL_THINKING_EXTENSION.read_text()

        self.assertIn('pi.on("input"', source)
        self.assertIn('pi.on("before_agent_start"', source)
        self.assertIn('pi.on("agent_end"', source)
        self.assertIn('pi.on("session_shutdown"', source)
        self.assertIn("pi.getThinkingLevel()", source)
        self.assertIn("pi.setThinkingLevel(", source)
        self.assertIn("parseFrontmatter", source)
        self.assertIn("metadata", source)
        self.assertIn("thinkingLevel", source)

    def test_workflow_skills_define_expected_thinking_levels(self) -> None:
        skill_names = {path.parent.name for path in (REPO_ROOT / "skills").glob("*/SKILL.md")}
        self.assertEqual(set(EXPECTED_SKILL_THINKING), skill_names)

        for skill_name, expected_level in EXPECTED_SKILL_THINKING.items():
            frontmatter = read_skill_frontmatter(skill_name)
            level = (frontmatter.get("metadata") or {}).get("thinkingLevel")
            self.assertIn(level, VALID_THINKING_LEVELS)
            self.assertEqual(expected_level, level)


if __name__ == "__main__":
    unittest.main()
