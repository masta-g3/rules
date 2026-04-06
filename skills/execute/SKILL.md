---
name: execute
description: Implement the approved plan.
---

Assume `SKILLS_ROOT` is set per `AGENTS.md` before running helper commands.

Work directly from the active plan or task we have been discussing.

### Baseline Verification (First Task Only)

Run a minimal smoke test before starting—run relevant tests if they exist, or start the app and confirm basic functionality. One quick check that confirms "system works" or "something's broken." If broken, stop and report to user.

### Begin Implementation

Iterate through each phase incrementally—implement, test, and verify tests pass before moving to the next phase. Mark completed steps with `[x]` and update the plan if scope or approach shifts. Consult the user only when blocked or facing open questions.

Before implementing new functionality, verify that existing features affected by your changes still work. If you discover broken state, report it to the user before proceeding.

**If working on a tracked feature (`{epic}-{nnn}.md`)**: before implementation starts, update that feature's `status` to `"in_progress"` in `features.yaml` with `$SKILLS_ROOT/_lib/features_yaml.sh update "{feature-id}" --json '{"status":"in_progress"}'`. `execute` owns the `pending` → `in_progress` transition.

### Discovered Work

During implementation, you may encounter sub-tasks not in the original plan.

**If working on a tracked feature (plan file matches `{epic}-{nnn}.md`):**
1. Check if this work already exists in features.yaml—if so, note the dependency but don't duplicate
2. If genuinely new, add to features.yaml with the repo-local helper using the normal `{epic}-{nnn}` ID format:
   - derive `FEATURE_ID` from the tracked plan filename
   - derive `EPIC` from that ID with `EPIC="${FEATURE_ID%-*}"`
   - generate the next ID with `$SKILLS_ROOT/_lib/features_yaml.sh next-id "$EPIC"`
   - set `discovered_from` to the parent feature ID
   - keep `status` as `"pending"` and append the record with `$SKILLS_ROOT/_lib/features_yaml.sh create --json`
3. Assess impact:
   - If it blocks current work → pause, work on discovered item first
   - If parallelizable → add to backlog, continue current work

**Always:** Update the plan document with a "Discovered Work" section.

Never silently absorb scope—make all work visible.

### Code Quality

While coding, adhere strictly to the minimalist philosophy originally outlined: avoid hacks, fallback mechanisms, or any form of bloat. Keep implementations clean, modular, and pattern-aligned.

Prefer the smallest change that fully solves the task. Reuse existing patterns and nearby abstractions when they fit; avoid widening the impact surface or introducing new structure unless the task clearly requires it.

At the end of each phase, ensure the code is in a clean, reviewable state—no half-implemented features, no commented-out debugging code, no broken imports.

When writing tests: no mock data, dummy assertions, or placeholder tests. Every test must validate actual functionality—if it doesn't test something meaningful, don't add it.

If the work touches UI or UX, follow the design principles and best practices of by top research design labs.

### Functional Testing (Complex User-Facing Features Only)

For substantial features where users interact directly—new UI flows, API endpoints, database schemas with user-visible impact, interactive elements (games, editors, etc.)—invoke a testing subagent to verify end-to-end behavior.

Test as a user would:
- UI: browser automation to walk through flows
- API: call endpoints with realistic payloads
- Data: query edge cases that could corrupt or mishandle user data

Keep testing concise but comprehensive—verify the feature works and key edge cases are covered. Skip for internal refactors or changes without user-observable behavior.

Fix issues found before proceeding. Report test summary to user (what was tested, pass/fail, any caveats).

### Session End

Report status clearly:

- **PLAN COMPLETE** — all phases done, ready for `/review`
- **PENDING STEPS** — list remaining phases/tasks, indicate next action
