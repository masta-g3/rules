---
name: execute
description: Execute on a plan.
---

Work directly from the active plan or task we have been discussing.

### Baseline Verification (First Task Only)

Run a minimal smoke test before starting — run existing tests or start the app and confirm basic functionality. If broken, stop and report.

### Begin Implementation

Iterate through each phase: implement, verify existing features still work, confirm tests pass, then move on. Mark completed steps with `[x]` and update the plan if scope or approach shifts. Consult the user only when blocked.

**Tracked features (`{epic}-{nnn}.md`):** set status to `in_progress` before starting: `$SKILLS_ROOT/_lib/features_yaml.sh update "{feature-id}" --json '{"status":"in_progress"}'`

### Discovered Work

**Tracked features:** check if the work exists in `features.yaml` first — if not, register it via `ticket-init` skill with `discovered_from` set to the parent feature ID.
- Blocks current work → pause, report to user, handle it first
- Parallelizable → add to backlog, continue

Update the plan document with a "Discovered Work" section. Never silently absorb scope.

### Code Quality

Prefer the smallest change that fully solves the task — keep it clean, modular, and pattern-aligned. Reuse existing patterns; avoid widening the impact surface unless clearly required.

At the end of each phase, ensure clean, reviewable state — no half-implemented features, no commented-out debug code, no broken imports.

No fallback mechanisms, hidden defaults, or mock functionality — if something doesn't work, surface it. Tests must validate actual behavior — no dummy assertions or placeholder tests. If UI/UX work, use the frontend design skill.

### Functional Testing (User-Facing Features Only)

For user-facing features (UI flows, API endpoints, interactive elements), invoke a testing subagent:
- UI: browser automation to walk through flows
- API: call endpoints with realistic payloads
- Data: query edge cases that could corrupt user data

### Session End

Report status clearly:

- **PLAN COMPLETE** — all phases done, ready for `/review`
- **PENDING STEPS** — list remaining phases/tasks, indicate next action
