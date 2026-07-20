#!/usr/bin/env python3

import unittest
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parent.parent
EXTENSION = REPO_ROOT / "extensions" / "workflow-runtime" / "index.ts"
RUNTIME_CORE = REPO_ROOT / "extensions" / "workflow-runtime" / "core.ts"
SKILL_THINKING_EXTENSION = REPO_ROOT / "extensions" / "skill-thinking.ts"
NOTIFY_EXTENSION = REPO_ROOT / "extensions" / "notify.ts"
SYNC_PROMPTS = REPO_ROOT / "sync-prompts.sh"
NEXT_FEATURE_SKILL = REPO_ROOT / "skills" / "next-feature" / "SKILL.md"
EXPECTED_SKILL_THINKING = {
    "commit": "low",
    "context-md": "high",
    "docs-health": "high",
    "epic-init": "high",
    "execute": "medium",
    "answer-style": "minimal",
    "explain-html": "high",
    "next-feature": "minimal",
    "plan-md": "high",
    "project-init": "high",
    "reflect": "medium",
    "review": "high",
    "test-coverage": "high",
    "ticket-init": "medium",
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
    def test_workflow_runtime_uses_current_pi_packages(self) -> None:
        source = EXTENSION.read_text()

        self.assertIn('from "@earendil-works/pi-coding-agent"', source)
        self.assertIn('from "@earendil-works/pi-tui"', source)
        self.assertIn('from "./core.ts"', source)
        self.assertNotIn("@mariozechner/pi-coding-agent", source)
        self.assertNotIn("@mariozechner/pi-tui", source)

    def test_next_feature_hands_off_directly_to_planning(self) -> None:
        source = NEXT_FEATURE_SKILL.read_text()

        self.assertIn("READY FOR PLAN", source)
        self.assertNotIn("READY FOR PRIME", source)

    def test_workflow_runtime_exposes_ticket_tool(self) -> None:
        source = EXTENSION.read_text()

        self.assertIn('import { Type } from "typebox";', source)
        self.assertIn('pi.registerTool({', source)
        self.assertIn('name: "set_workflow_ticket"', source)
        self.assertIn('ticketId: Type.String', source)

    def test_workflow_runtime_owns_focus_mode(self) -> None:
        source = EXTENSION.read_text()

        self.assertIn('const FOCUS_SKILL = "focus";', source)
        self.assertIn('"FOC ✦"', source)
        self.assertIn('"FOC ✧"', source)
        self.assertIn('pi.on("agent_end"', source)
        self.assertNotIn("LONG EXECUTE CONTINUE", source)
        self.assertNotIn("maxTurns", source)

    def test_workflow_runtime_wires_compaction_and_focus_contract(self) -> None:
        source = EXTENSION.read_text()
        core = RUNTIME_CORE.read_text()

        self.assertIn('pi.on("session_compact"', source)
        self.assertIn('reason: event.reason', source)
        self.assertIn('pi.on("before_agent_start"', source)
        self.assertIn("focusContract(state)", source)
        self.assertIn('$SKILLS_ROOT/execute/SKILL.md', core)
        self.assertIn("active plan document if one exists", core)
        self.assertIn("feature or task the user provided", core)

    def test_workflow_runtime_registers_focus_exit_tool(self) -> None:
        source = EXTENSION.read_text()

        self.assertIn('name: "end_focus"', source)
        self.assertIn('Type.Literal("completed")', source)
        self.assertIn('Type.Literal("blocked")', source)
        self.assertIn('summary: Type.String', source)
        self.assertIn('{ type: "end-focus" }', source)

    def test_workflow_runtime_registers_compact_continuation_event(self) -> None:
        source = EXTENSION.read_text()
        core = RUNTIME_CORE.read_text()

        self.assertIn('pi.registerMessageRenderer(EVENT_TYPE', source)
        self.assertIn('keyHint("app.tools.expand"', source)
        self.assertIn('customType: EVENT_TYPE', source)
        self.assertIn('triggerTurn: true, deliverAs: "followUp"', source)
        self.assertIn("When all requested work is implemented and verified, call", core)
        self.assertIn("end_focus", core)

    def test_legacy_workflow_extensions_are_removed(self) -> None:
        self.assertFalse((REPO_ROOT / "extensions" / "workflow-indicator.ts").exists())
        self.assertFalse((REPO_ROOT / "extensions" / "long-execute.ts").exists())

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

    def test_sync_prompts_syncs_pi_only_skills_to_pi(self) -> None:
        source = SYNC_PROMPTS.read_text()

        self.assertIn('${repo_root}/pi/skills/', source)
        self.assertIn('${pi_root}/skills/', source)
        self.assertIn('"pi_skills"', source)
        self.assertIn('print_row "pi-only skills" "pi_skills" "pi"', source)
        self.assertNotIn('${claude_root}/skills/" "pi_skills"', source)
        self.assertNotIn('${cursor_root}/skills/" "pi_skills"', source)
        self.assertNotIn('${codex_root}/skills/" "pi_skills"', source)

    def test_focus_skill_delegates_execution_and_requires_explicit_exit(self) -> None:
        source = (REPO_ROOT / "pi" / "skills" / "focus" / "SKILL.md").read_text()

        self.assertIn("$SKILLS_ROOT/execute/SKILL.md", source)
        self.assertIn("active plan document when one exists", source)
        self.assertIn("`end_focus`", source)
        self.assertNotIn("LONG EXECUTE CONTINUE", source)
        self.assertFalse((REPO_ROOT / "pi" / "skills" / "long-execute").exists())

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
