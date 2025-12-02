---
description: Implement the approved plan without introducing bloat.
---

Work directly from the active plan we have been discussing.

### Baseline Verification

Quick smoke test to confirm project isn't broken—keep this minimal:
- **Web apps**: Start dev server, verify homepage loads
- **Libraries/packages**: Run `npm test` or equivalent, verify it passes
- **CLI tools (non-TUI)**: Run one basic command, verify exit code 0
- **TUIs**: Prefer Textual headless (`app.run_test`) to avoid terminal artifacts; otherwise ensure clean exit/reset to avoid garbled text

One test that tells you "proceed" or "broken." If broken, stop and report to user.

### Begin Implementation

**If plan file is named `{epic}-{nnn}.md` (e.g., `auth-001.md`):**
- This is a tracked feature—set its `status` to `"in_progress"` via jq
- This is the commitment point

Iterate through each phase incrementally—implement, test, and seek user feedback before moving to the next phase. Mark completed steps with `[x]` and update the plan if scope or approach shifts.

Before implementing new functionality, verify that existing features affected by your changes still work. If you discover broken state, report it to the user before proceeding.

### Discovered Work

During implementation, you may encounter sub-tasks not in the original plan.

**If working on a tracked feature (plan file matches `{epic}-{nnn}.md`):**
1. Add discovered items to features.json via jq:
   - ID: `{parent-id}.n` (e.g., `auth-001.1`)
   - `discovered_from`: parent feature ID
   - `status`: `"pending"`, `created_at`: today
2. Assess impact:
   - If it blocks current work → pause, work on discovered item first
   - If parallelizable → add to backlog, continue current work

**Always:** Update the plan document with a "Discovered Work" section.

Never silently absorb scope—make all work visible.

While coding, adhere strictly to the minimalist philosophy originally outlined: avoid hacks, fallback mechanisms, or any form of bloat. Keep implementations clean, modular, and pattern-aligned.

At the end of each phase, ensure the code is in a clean, reviewable state—no half-implemented features, no commented-out debugging code, no broken imports.

If the work touches UI or UX, follow the principles and best practices championed by top research design labs.

### Session End

Report status clearly:

- **PLAN COMPLETE** — all phases done, ready for `/commit`
- **PENDING STEPS** — list remaining phases/tasks, indicate next action
