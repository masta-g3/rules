---
name: execute
description: Execute on a plan.
---

Work directly from the active plan or task we have been discussing.

Only start execution when authorized by the user. Reading this skill does not authorize work.

### Runtime integration

#### Pi

When the tools are available:
- Before starting, call `set_workflow_step` with `stepId: "execute"`. Changing the indicator does not authorize additional work.
- For a Rules-owned worktree, keep the ticket binding current with `set_workflow_ticket`, passing the exact record path as `worktreeRecord`.

#### Worktree tooling

Before using an agent-managed worktree, follow validation in [the worktree helper reference](../_lib/worktrees.md). If a host such as Hub supplies a mapping, verify and use it without creating or registering a Rules record.

### Baseline Verification

Check the relevant baseline once before starting. Report existing failures; stop only if they block the task or its verification. Ask before fixing unrelated failures.

### Begin Implementation

Iterate through each phase: implement, verify existing features still work, confirm tests pass, then move on. Mark completed steps with `[x]` as you go.

Execute the approved plan autonomously end-to-end unless the plan says otherwise. Resolve routine implementation issues within the approved scope. If a fix would change agreed behavior, acceptance criteria, architecture, dependencies, or data safety, stop and ask the user before proceeding. Record approved changes in the plan before continuing.

If the plan names a worktree, do all implementation, verification, ticket reads, and plan updates there. If its location or ownership cannot be verified, stop and report the blocker. Do not create a replacement, discover another worktree, or fall back to the source checkout.

Reuse externally managed worktrees without taking ownership.

**Tracked features (`{epic}-{nnn}.md`):** set status to `in_progress` before starting: `$SKILLS_ROOT/_lib/features_yaml.sh update "{feature-id}" --json '{"status":"in_progress"}'`

### Discovered Work

For non-blocking friction in docs, workflows, or interfaces, use `Reflection Candidates` below instead of creating a ticket during execution.

**Tracked features:** check if the work exists in `agent-work/features.yaml` first — if not, register it via `ticket-init` skill with `discovered_from` set to the parent feature ID.
- Blocks current work → resolve within approved scope if small and low-risk; otherwise stop and ask the user
- Parallelizable → add to backlog, continue

Update the plan document with a "Discovered Work" section. Never silently absorb new scope into the current task.

### Documentation and Reflection Candidates

Update docs during execution only when the approved plan lists them as explicit deliverables.

Record meaningful unresolved friction under `Reflection Candidates` in the active plan: misleading docs or instructions, confusing interfaces or errors, and repeated manual work. Include the problem, impact, and brief evidence. If no plan exists, report these at handoff instead of creating a separate log.

Fix issues within approved scope. Capture unrelated, non-blocking issues and continue. If an out-of-scope issue blocks progress, ask before expanding scope.

### Code Quality

- Before writing new machinery, inspect the plan's reference paths and the nearest analogous implementation. Reuse or extend the code that already owns the behavior.
- Make the smallest, simplest change that fully solves the task. Prefer a fundamental fix in the owning layer over a localized patch, and replace obsolete code instead of leaving parallel paths.
- Do not introduce another way to perform an existing operation because this case varies slightly. Use the established mechanism or its extension points; if they are genuinely inadequate, stop and justify changing the shared pattern rather than adding a competing one.
- Do not stack hotfixes, workarounds, or conditional branches around an existing pattern. Fix the underlying code or shared pattern; if that exceeds the approved plan, consult the user instead of patching around it.
- If two fixes fail the same test, stop patching. Explain why you expected them to work, then check that explanation against the code before trying again.
- Do not add fallbacks, inferred defaults, mock functionality, or blanket exception handling. Let errors surface unless recovery is specific and intentional.
- Tests must validate actual behavior — no dummy assertions or placeholders. Tautological tests are harmful.

### Functional Testing (User-Facing Features Only)

For user-facing features (UI flows, API endpoints, interactive elements), test real behavior directly or through a testing subagent:
- UI: Playwright or equivalent real-browser automation to walk through flows
- API: call endpoints with realistic payloads
- Data: query edge cases that could corrupt user data

### Session End

At the end of each phase, ensure clean, reviewable state — no half-implemented features, no commented-out debug code.

### Output

Briefly identify unresolved reflection candidates at handoff, if any.

For successful execution, include a `Summary:` list with 2–5 bullets grouping the implemented behavior and notable reuse or replacement of existing code. Include material plan adjustments, then end with the verification run and result. Avoid a file-by-file changelog.
- **READY FOR REVIEW** — all phases done and ready for `/review`

Otherwise:
- **BLOCKED / PENDING STEPS** — explain the blocker, list remaining phases/tasks, indicate next action