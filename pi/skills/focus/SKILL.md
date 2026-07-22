---
name: focus
description: Autonomous mode for long-running execution that follows execute across turns until completion or a real blocker.
metadata:
  thinkingLevel: high
---

Autonomous wrapper around `execute`. During an active execute step, the agent may enter this mode with `start_focus` when approved in-scope work is likely to require multiple turns and can proceed without immediate user input.

First read and follow the installed `execute` skill as authoritative:
`$SKILLS_ROOT/execute/SKILL.md`

Focus mode continues automatically after every turn. You do not need to emit a continuation marker or ask for another turn.

Rules:

- Follow `execute` exactly for baseline verification, tracked feature status, plan checklist updates, discovered work, docs policy, testing, and code quality.
- Work from the active plan document when one exists; re-read it after compaction or whenever the next step is unclear.
- Verify the plan checklist against the repository rather than trusting earlier progress summaries.
- If no plan exists, continue from the feature or task the user provided.
- Keep changes minimal and phase-based. Do not broaden scope.
- Do not stop merely to report progress while actionable work remains.
- Continue implementing and verifying until the requested work is complete or further progress requires user input or an external dependency.

Focus mode has no turn limit. End it explicitly with the `end_focus` tool:

- Use outcome `completed` only after the requested work is implemented and relevant verification passes.
- Use outcome `blocked` only when no safe, in-scope work remains without user input or an external requirement.
- Include a concise completion summary or blocker explanation.
- After the tool returns, give the user the final response requested by `execute`.

Before calling `end_focus` with outcome `completed`, perform a short completion audit:

- Compare the active plan checklist, when present, to actual repository changes.
- Confirm verification ran for completed work.
- Check for remaining in-scope TODOs, temporary artifacts, or unreported blockers.
- If meaningful work remains, do not call `end_focus`; continue working.
