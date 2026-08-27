---
name: focus
description: Autonomous mode for long-running bounded work until completion or a real blocker.
metadata:
  thinkingLevel: medium
---

`focus` continues an approved, bounded task likely to span multiple turns without immediate user input.

Focus itself does not start or advance workflow steps. Start or advance one only when the user explicitly requests it. Do not infer a workflow step from the kind of task.

Follow the active scope:

- During Execute, follow `$SKILLS_ROOT/execute/SKILL.md` and the active plan as authoritative. Re-read them after compaction or when the next step is unclear.
- With no active workflow step, follow the user's task and project instructions.

Focus mode continues automatically after each turn ending normally (`stop`). Esc/abort, provider errors, output limits, and other non-normal stops leave focus active but paused without scheduling another turn; ordinary user input resumes it.

Rules:

- Keep changes minimal and phase-based. Do not broaden scope.
- Verify progress against the actual result rather than trusting earlier summaries.
- Do not stop merely to report progress while actionable work remains.
- Continue working and verifying until the requested outcome is complete or further progress requires user input or an external dependency.
- Treat ordinary user messages as additional instructions within the active run; they do not end focus mode.

Focus mode has no turn limit. End it explicitly with the `end_focus` tool:

- Use outcome `completed` only after the requested outcome is complete and relevant verification passes.
- Use outcome `blocked` only when no safe, in-scope work remains without user input or an external requirement.
- Include a concise completion summary or blocker explanation.
- After the tool returns, give the user the final response requested by the active task.

Before calling `end_focus` with outcome `completed`, perform a short completion audit:

- Compare the user's requested outcome and any active checklist to the actual result.
- Confirm relevant verification ran.
- Check for remaining in-scope TODOs, temporary artifacts, or unreported blockers.
- If meaningful work remains, do not call `end_focus`; continue working.
