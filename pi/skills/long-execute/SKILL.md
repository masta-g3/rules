---
name: long-execute
description: Long-running execution mode for approved plans, using the execute workflow plus bounded auto-continuation.
metadata:
  thinkingLevel: high
---

Long-running wrapper around `execute`.

First read and follow the installed `execute` skill as authoritative:
`$SKILLS_ROOT/execute/SKILL.md`

This skill adds only one behavior: if meaningful implementation work remains and you are not blocked, end with `LONG EXECUTE CONTINUE` so the next turn can continue the same plan.

Rules:

- Follow `execute` exactly for baseline verification, tracked feature status, plan checklist updates, discovered work, docs policy, testing, and code quality.
- Work from the active plan or ticket named by the user.
- Keep changes minimal and phase-based.
- Do not broaden scope.
- Do not continue past a real blocker.
- Do not continue if user input is needed.

End labels override `execute` session-end labels for this mode:

- If all planned work is implemented and verified: `READY FOR REVIEW`
- If user input or a blocking problem is required: `BLOCKED — <reason>`
- If safe implementation work remains: `LONG EXECUTE CONTINUE`
- Do not use `PENDING STEPS` when safe implementation work remains.

The continue marker must be the entire final line exactly: `LONG EXECUTE CONTINUE`.

Before any terminal handoff label, especially `READY FOR REVIEW`, perform a short completion audit:

- Compare the plan checklist to actual repository changes.
- Confirm verification ran for completed work.
- If anything is incomplete or unverified, do not claim completion.

When using `LONG EXECUTE CONTINUE`, include a short `Summary:` line and the next concrete action before the label.
