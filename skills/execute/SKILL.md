---
name: execute
description: Execute on a plan.
metadata:
  thinkingLevel: medium
---

Work directly from the active plan or task we have been discussing.

### Baseline Verification (First Task Only)

Run a minimal smoke test before starting — run existing tests or start the app and confirm basic functionality. If broken, stop and report.

### Begin Implementation

Iterate through each phase: implement, verify existing features still work, confirm tests pass, then move on. Mark completed steps with `[x]` as you go.

Execute the approved plan autonomously end-to-end unless the plan says otherwise. If it cannot be implemented as planned, try a clean minimal fix within the plan’s intent; stop and consult the user before hacks, ad-hoc patches, unreviewed rearchitecture, or significant deviations.

**Tracked features (`{epic}-{nnn}.md`):** set status to `in_progress` before starting: `$SKILLS_ROOT/_lib/features_yaml.sh update "{feature-id}" --json '{"status":"in_progress"}'`

### Discovered Work

**Tracked features:** check if the work exists in `agent-work/features.yaml` first — if not, register it via `ticket-init` skill with `discovered_from` set to the parent feature ID.
- Blocks current work → handle it first if small and low-risk; otherwise pause and report to the user
- Parallelizable → add to backlog, continue

Update the plan document with a "Discovered Work" section. Never silently absorb new scope into the current task.

### Documentation

Update docs during execution only when the approved plan lists them as explicit deliverables. Otherwise, capture documentation gaps or lessons discovered during implementation under `Reflection Candidates` in the plan for `/reflect`.

### Code Quality

- Before implementing, identify the existing code that owns the behavior.
- Make the smallest, simplest change that fully solves the task. Prefer fundamental fixes over localized patches or parallel solutions, and replace obsolete code.
- Reuse existing patterns; keep changes modular and avoid widening the impact without clear need.
- Do not add fallbacks, inferred defaults, mock functionality, or blanket exception handling. Let errors surface unless recovery is specific and intentional.
- Tests must validate actual behavior — no dummy assertions or placeholders.
- For UI/UX work, invoke the `frontend-designer` subagent if available.

### Functional Testing (User-Facing Features Only)

For user-facing features (UI flows, API endpoints, interactive elements), invoke a testing subagent and validate real behavior:
- UI: Playwright or equivalent real-browser automation to walk through flows
- API: call endpoints with realistic payloads
- Data: query edge cases that could corrupt user data

### Session End

At the end of each phase, ensure clean, reviewable state — no half-implemented features, no commented-out debug code.

For successful execution, include a `Summary:` line with 1-2 sentences on what was implemented, verified, and any minor plan adjustments before the handoff label.
- **READY FOR REVIEW** — all phases done and ready for `/review`

Otherwise:
- **BLOCKED / PENDING STEPS** — explain the blocker, list remaining phases/tasks, indicate next action