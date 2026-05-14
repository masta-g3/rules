**Feature:** cmd-005 → Restore full command behavioral guidance into skill SKILL.md files

## Objective

The cmd-004 migration extracted deterministic operations into scripts correctly, but stripped the LLM behavioral guidance (judgment policies, quality gates, subagent invocations, output formats) from the SKILL.md files. Restore the full command prose into each skill, with the only surgical changes being references to the new `skills/_lib/` and `skills/*/scripts/` utilities instead of inline bash.

## Scope

In scope:
- Restore all missing behavioral guidance from commands into SKILL.md files.
- Replace inline bash/yq snippets with script invocations where scripts now exist.
- Keep frontmatter aligned to the minimal spec (no `disable-model-invocation: false`, no `model` unless pinned).

Out of scope:
- New behavior not in the original commands.
- Changes to the shell scripts themselves.
- Changes to `sync-prompts.sh` or deployment.

## Context Files

### Core (files to modify)
- `skills/plan-md/SKILL.md`
- `skills/execute/SKILL.md`
- `skills/commit/SKILL.md`
- `skills/epic-init/SKILL.md`
- `skills/project-init/SKILL.md`
- `skills/test-coverage/SKILL.md`
- `skills/ticket-init/SKILL.md`
- `skills/next-feature/SKILL.md`
- `skills/autopilot/SKILL.md`
- `skills/prime/SKILL.md`

### Reference (originals, recovered from git)
- `git show 30349ea^:commands/*.md` — the canonical behavioral source

### Utility scripts (replace inline bash with these)
- `skills/_lib/workflow_state.sh`
- `skills/_lib/feature_id.sh`
- `skills/_lib/file_lock.sh`
- `skills/_lib/select_next_feature.sh`
- `skills/plan-md/scripts/register_feature.sh`
- `skills/commit/scripts/archive_plan.sh`
- `skills/commit/scripts/mark_done.sh`
- `skills/autopilot/scripts/start_workflow.sh`

## Translation Rules

For each skill:
1. Start from the original command text as the behavioral baseline.
2. Keep the minimal frontmatter (name, description, argument-hint where needed).
3. Replace inline bash snippets with script invocations where a script exists.
4. Replace the `## Autopilot State Transition` inline jq block with `skills/_lib/workflow_state.sh /next-skill` — EXCEPT for `commit`, which has complex single/continuous mode branching that must be restored verbatim (no script exists for this).
5. Remove `disable-model-invocation: false` (it's the default). Keep `disable-model-invocation: true` where the original command had it: epic-init, ticket-init, next-feature, autopilot, project-init, test-coverage.
6. Remove `model:` for ticket-init and next-feature (the pinned models were micro-optimizations, not behavioral requirements). Keep `model:` only for autopilot.
7. `archive_plan.sh` only copies — the SKILL.md must explicitly instruct: (a) after running the script, rename the archive to include `_{short_desc}` suffix matching the original format `yyyymmdd_{id}_{short_desc}.md`, then (b) delete the original plan file.
8. Do NOT add new behavior, guardrails, or instructions not present in the original command.

## Known Script Divergences

These are behavioral differences between the utility scripts and the original inline bash. They are intentional improvements from the cmd-004 bugfix pass (`1b8df83`) but should be acknowledged:

1. **`select_next_feature.sh`** treats `in_progress` features as resolved for dependency checking. The original commands only treated `done` as resolved. This prevents deadlocks in parallel mode. The restored SKILL.md prose may say "status: done" for deps, but the script is authoritative — do not "fix" the script to match the old prose.

2. **`register_feature.sh`** infers epic by extracting the first alphanumeric word from the request. The original plan-md command implied semantic matching against existing epics. The restored SKILL.md should instruct the model to validate the script's epic inference against existing prefixes in `features.yaml` and override if needed.

## Per-Skill Delta

### 1. prime
**Current skill:** 4-step summary.
**Command had:** More descriptive prose about reading and understanding the codebase, paying attention to the task topic.
**Action:** Restore the full prose. Keep script reference for autopilot transition.
**Severity:** Low — mostly stylistic.

### 2. plan-md
**Current skill:** 5 terse rules.
**Command had (80 lines):**
- Plan file naming with 3 modes (feature ID, auto-register, standalone)
- Clarify before planning
- Context files section (Core, Reference, Config)
- Create plan: one-liner, alternatives, detailed implementation (200+ lines for substantial, concise for minor), architecture layout, UI design direction
- Verification strategy per phase
- Parallel mode (--parallel, file reservations check)
- Mark feature active
- Plan-critic subagent invocation
- Scope control warnings
- Autopilot transition with exception handling

**Action:** Restore full command body. Replace:
- `auto-register (infer epic, assign next number)` inline description → `skills/plan-md/scripts/register_feature.sh "$1"`
- inline jq autopilot block → `skills/_lib/workflow_state.sh /execute`

**Severity:** High — most content was lost.

### 3. execute
**Current skill:** 6 terse points.
**Command had (83 lines):**
- Baseline verification (smoke test, stop if broken)
- Iterate phases incrementally with user feedback, mark `[x]`, update plan
- Verify existing features still work
- File reservations with full protocol detail
- Discovered work: check existing, sub-ticket ID format, impact assessment
- Code quality: minimalist philosophy, clean state, no mock tests, UI design principles
- Functional testing: invoke testing subagent for complex features
- Session end: PLAN COMPLETE or PENDING STEPS
- Autopilot transition with exception handling

**Action:** Restore full command body. Replace:
- File reservations inline protocol → `skills/_lib/file_lock.sh` reference (already done)
- inline jq autopilot block → `skills/_lib/workflow_state.sh /commit`

**Severity:** High — most content was lost.

### 4. commit
**Current skill:** 6 terse steps.
**Command had (137 lines):**
- Code-critic subagent invocation for non-trivial changes
- Clean state checklist (debug artifacts, AI slop, convention match)
- Archive planning doc with naming format and transform-to-spec instructions
- Update features.yaml (done, completed_at, spec_file, discovered items)
- Release file reservations
- Commit conventions: message format, examples, don't push, only session files
- Verify STRUCTURE.md needs update
- Autopilot single vs continuous mode (full bash with looping/termination)

**Action:** Restore full command body. Replace:
- Archive inline logic → `skills/commit/scripts/archive_plan.sh <plan-file>` + explicit "delete original plan file" instruction + model provides descriptive `{short_desc}` suffix
- features.yaml update inline → `skills/commit/scripts/mark_done.sh <feature-id> <archive-path>`
- File lock release inline → `skills/_lib/file_lock.sh release-all "" <feature-id>`
- Do NOT replace autopilot section with `workflow_state.sh` — the commit autopilot logic has full single/continuous mode branching (rm workflow.json, loop or terminate). Restore the full section, but use `skills/_lib/select_next_feature.sh --id features.yaml "$EPIC"` for the next-feature selection instead of the inline jq query. The workflow.json write/rm logic stays inline.

**Severity:** High — most content was lost.

### 5. epic-init
**Current skill:** 4 terse steps.
**Command had (71 lines):**
- Clarify before decomposing (ask user, decomposition errors costly)
- Sizing guardrails (4-10 features, single testable outcome, grouping rules)
- Epic doc format (~20 lines, spec_file reference)
- Full schema with all fields
- Priority guide (1=foundation, 2=core, 3=polish)
- yq append command
- Report format (prefix, count by priority, dependencies, recommended start, assumptions)
- "Do not begin implementation" guard

**Action:** Restore full command body. Replace:
- Inline ID generation → `skills/_lib/feature_id.sh features.yaml "$EPIC"`

**Severity:** Medium — significant behavioral guidance lost.

### 6. project-init
**Current skill:** 3 terse lines.
**Command had (65 lines):**
- Clarify before scaffolding (vision, constraints, ask user)
- Create project structure (stack, version control, deps, README, features.yaml)
- STRUCTURE.md content guide (vision, tech stack, architecture, data models, patterns, UI)
- Initial commit guidance with example
- Report format with next step
- "Do not decompose features" guard

**Action:** Restore full command body.
**Severity:** Medium — structural guidance lost.

### 7. test-coverage
**Current skill:** 3 terse lines.
**Command had (78 lines):**
- Survey infrastructure (framework, locations, how to run)
- Map critical paths (5 categories)
- Gap classification (covered, partial, gap)
- Report template with format
- Implementation guidelines (conventions, one test per behavior, real data, run tests)
- Test quality principles (3 rules)

**Action:** Restore full command body.
**Severity:** Medium — significant detail lost.

### 8. ticket-init
**Current skill:** 4 terse steps.
**Command had (60 lines):**
- Determine epic with yq prefix extraction
- Generate ID with yq query
- Full schema with all fields
- Priority guide
- yq append command
- Report format
- "Do not plan or implement" guard

**Action:** Restore full command body. Replace:
- Inline ID generation → `skills/_lib/feature_id.sh features.yaml "$EPIC"`

**Severity:** Medium — schema and priority guide lost.

### 9. next-feature
**Current skill:** Delegates to script + output format.
**Command had (52 lines):**
- Review state (git log, yq query, read STRUCTURE.md if unclear)
- Selection criteria detail (ready = pending + deps, priority tiebreaking)
- No-ready handling (circular deps, blocked prereqs, report)
- Output format
- "Do not modify features.yaml" guard

**Action:** Restore behavioral guidance around the script. The script handles selection, but the model needs the context about when to read STRUCTURE.md, how to handle edge cases, and the guard.
**Severity:** Low-medium.

### 10. autopilot
**Current skill:** 3 lines + script invocations.
**Command had (127 lines):**
- Environment check (Claude-only, hook requirement)
- Parse arguments (--epic for continuous, otherwise single)
- Single mode: query, exception format, workflow.json schema, output format
- Continuous mode: epic scope, find first feature, workflow.json schema, output format
- "Do nothing else" instruction

**Action:** The `start_workflow.sh` script handles the deterministic logic correctly. Restore the environment check prose, argument parsing instructions, output format templates, and exception format templates that the model needs for user-facing output. Keep script invocations for the actual state mutations.
**Severity:** Medium — output format and exception templates lost.

## Implementation Phases

### Phase 1 — High severity: plan-md, execute, commit
- [x] Restore `skills/plan-md/SKILL.md` from command, replace inline bash with script refs
- [x] Restore `skills/execute/SKILL.md` from command, replace inline bash with script refs
- [x] Restore `skills/commit/SKILL.md` from command, replace inline bash with script refs (keep full autopilot inline)

### Phase 2 — Medium severity: epic-init, project-init, test-coverage, ticket-init, autopilot
- [x] Restore `skills/epic-init/SKILL.md`
- [x] Restore `skills/project-init/SKILL.md`
- [x] Restore `skills/test-coverage/SKILL.md`
- [x] Restore `skills/ticket-init/SKILL.md`
- [x] Restore `skills/autopilot/SKILL.md`

### Phase 3 — Low severity: prime, next-feature
- [x] Restore `skills/prime/SKILL.md`
- [x] Restore `skills/next-feature/SKILL.md`

### Phase 4 — Verification (all 10 skills)
- [x] For each skill, run a structured diff:
  1. Extract command body (strip frontmatter) from `git show 30349ea^:commands/{name}.md`
  2. Extract skill body (strip frontmatter) from `skills/{name}/SKILL.md`
  3. Confirm every behavioral point in the command exists in the skill
  4. Confirm the only differences are: script invocations replacing inline bash, frontmatter minimization, and the commit autopilot kept inline
- [x] Run `sync-prompts.sh` and verify all skills deploy cleanly

## Verification Strategy

For each skill, after restoration:
1. Strip frontmatter from both command (git history) and skill (working tree).
2. Visually diff the two bodies — the only acceptable differences are:
   - Inline bash replaced by `skills/*/scripts/*.sh` or `skills/_lib/*.sh` invocations
   - `disable-model-invocation: false` removed from frontmatter (default)
   - `model:` removed from frontmatter (unless pinned)
3. Every section header, behavioral instruction, output format template, guard instruction, and subagent invocation from the command must appear in the skill.
4. No new instructions added that weren't in the command.
