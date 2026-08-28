---
name: execute
description: Execute on a plan.
metadata:
  thinkingLevel: medium
---

Work directly from the active plan or task we have been discussing.

### Baseline Verification

If not done before, run a minimal smoke test before starting — run existing tests or start the app and confirm basic functionality. If broken, stop and report.

### Begin Implementation

Iterate through each phase: implement, verify existing features still work, confirm tests pass, then move on. Mark completed steps with `[x]` as you go.

Execute the approved plan autonomously end-to-end unless the plan says otherwise. If it cannot be implemented as planned, try a clean minimal fix within the plan’s intent; stop and consult the user before hacks, ad-hoc patches, unreviewed rearchitecture, or significant deviations.

If the plan names a worktree, do all implementation, test runs, and plan-checklist updates inside it. Re-create it with `git worktree add` if it is missing.

**Tracked features (`{epic}-{nnn}.md`):** set status to `in_progress` before starting: `$SKILLS_ROOT/_lib/features_yaml.sh update "{feature-id}" --json '{"status":"in_progress"}'`

### Discovered Work

**Tracked features:** check if the work exists in `agent-work/features.yaml` first — if not, register it via `ticket-init` skill with `discovered_from` set to the parent feature ID.
- Blocks current work → handle it first if small and low-risk; otherwise pause and report to the user
- Parallelizable → add to backlog, continue

Update the plan document with a "Discovered Work" section. Never silently absorb new scope into the current task.

### Documentation

Update docs during execution only when the approved plan lists them as explicit deliverables. Otherwise, capture documentation gaps or lessons discovered during implementation under `Reflection Candidates` in the plan for `/reflect`.

### Code Quality

- Before writing new machinery, inspect the plan's reference paths and the nearest analogous implementation. Reuse or extend the code that already owns the behavior.
- Make the smallest, simplest change that fully solves the task. Prefer a fundamental fix in the owning layer over a localized patch, and replace obsolete code instead of leaving parallel paths.
- Do not introduce another way to perform an existing operation because this case varies slightly. Use the established mechanism or its extension points; if they are genuinely inadequate, stop and justify changing the shared pattern rather than adding a competing one.
- Do not stack hotfixes, workarounds, or conditional branches around an existing pattern. Fix the underlying code or shared pattern; if that exceeds the approved plan, consult the user instead of patching around it.
- Do not add fallbacks, inferred defaults, mock functionality, or blanket exception handling. Let errors surface unless recovery is specific and intentional.
- Tests must validate actual behavior — no dummy assertions or placeholders.

### Functional Testing (User-Facing Features Only)

For user-facing features (UI flows, API endpoints, interactive elements), invoke a testing subagent and validate real behavior:
- UI: Playwright or equivalent real-browser automation to walk through flows
- API: call endpoints with realistic payloads
- Data: query edge cases that could corrupt user data

### Session End

At the end of each phase, ensure clean, reviewable state — no half-implemented features, no commented-out debug code.

### Output

For successful execution, include a `Summary:` list with 2–5 bullets grouping the implemented behavior and notable reuse or replacement of existing code. Include material plan adjustments, then end with the verification run and result. Avoid a file-by-file changelog.
- **READY FOR REVIEW** — all phases done and ready for `/review`

Otherwise:
- **BLOCKED / PENDING STEPS** — explain the blocker, list remaining phases/tasks, indicate next action