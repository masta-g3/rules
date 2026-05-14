**Feature:** skill-001 → Extract workflow & file-lock instructions into standalone mini-skills

## Context

Four SKILL.md files embed inline instructions for two cross-cutting concerns:

1. **Autopilot State Transition** — appears in prime, plan-md, execute, commit
2. **File Reservations (Parallel Mode)** — appears in plan-md, execute, commit

These blocks are extracted into standalone markdown docs in `skills/_lib/`, and each SKILL.md gets a minimal one-liner reference instead.

## Context Files

**Core** (files being modified):
- `skills/prime/SKILL.md`
- `skills/plan-md/SKILL.md`
- `skills/execute/SKILL.md`
- `skills/commit/SKILL.md`

**New files:**
- `skills/_lib/WORKFLOW.md`
- `skills/_lib/FILE_LOCK.md`

**Reference:**
- `skills/_lib/workflow_state.sh`
- `skills/_lib/file_lock.sh`
- `skills/_lib/select_next_feature.sh`
- `skills/autopilot/SKILL.md` (untouched — it's the entry point, not a consumer)

## What Gets Extracted

### 1. Autopilot Sections → `skills/_lib/WORKFLOW.md`

Each skill currently has a `## Autopilot State Transition` block after a `---` separator. The content varies per skill:

| Skill | Next command | Condition | Exception abort |
|-------|-------------|-----------|-----------------|
| prime | `/plan-md` | workflow.json exists | — |
| plan-md | `/execute` | workflow.json exists | ambiguous requirements |
| execute | `/commit` | workflow.json exists AND plan complete | baseline/tests/build fail |
| commit | (complex) | workflow.json exists | git conflicts |

**commit** is unique: it reads `.mode` (single vs continuous), either deletes workflow.json or loops back via `select_next_feature.sh`.

The standalone `WORKFLOW.md` will contain:
- The general protocol (check → advance → abort on exception)
- A per-skill table mapping skill → next command → condition → abort trigger
- The commit-specific single/continuous mode logic in full

Each SKILL.md then replaces its full autopilot block with:
```
If autopilot active, follow `$SKILLS_ROOT/_lib/WORKFLOW.md` (this skill: `<skill-name>`).
```

### 2. File Lock Sections → `skills/_lib/FILE_LOCK.md`

Three skills have file-lock instructions with distinct roles:

| Skill | Section title | Role |
|-------|---------------|------|
| plan-md | "Parallel Mode (File Reservations)" | Check conflicts during planning |
| execute | "File Reservations (Parallel Mode)" | Reserve/modify/release per file |
| commit | "Release File Reservations" | Release-all on commit |

The standalone `FILE_LOCK.md` will contain:
- Protocol overview (presence-based: only active if `.file-locks.json` exists)
- **Planning phase**: check conflicts, report (informational only)
- **Execution phase**: check → reserve → modify → release (one at a time, retry logic)
- **Commit phase**: release-all for feature, delete lock file if empty, include in commit

Each SKILL.md then replaces its file-lock block with:
```
If `docs/plans/.file-locks.json` exists, follow `$SKILLS_ROOT/_lib/FILE_LOCK.md` (<phase> protocol).
```

## Implementation

### Phase 1: Create standalone docs

- [x] Create `skills/_lib/WORKFLOW.md` with full autopilot protocol
- [x] Create `skills/_lib/FILE_LOCK.md` with full reservation protocol
- [x] Verify content is complete — every instruction from every source skill is represented

### Phase 2: Strip SKILL.md files

- [x] `prime/SKILL.md`: remove Autopilot section, add one-liner reference
- [x] `plan-md/SKILL.md`: remove Parallel Mode + Autopilot sections, add one-liner references
- [x] `execute/SKILL.md`: remove File Reservations + Autopilot sections, add one-liner references
- [x] `commit/SKILL.md`: remove Release File Reservations + Autopilot sections, add one-liner references
- [x] Verify all other content remains exactly as-is

### Phase 3: Verify

- [x] Diff each SKILL.md — only the targeted sections removed, replaced by one-liner references
- [x] No content drift (all non-extracted text identical to original)
- [x] Standalone docs are self-contained (no missing context)

## Design Decisions

**Placement**: `skills/_lib/` — alongside the shell scripts they reference. Natural home for shared skill infrastructure.

**Reference style**: One-liner at the same position where the section was, keeping the SKILL.md reading order intact. The reference includes the skill name or phase so the standalone doc can branch on context.

**No changes to**: `autopilot/SKILL.md`, `next-feature/SKILL.md`, `epic-init/SKILL.md`, `project-init/SKILL.md`, `ticket-init/SKILL.md`, `test-coverage/SKILL.md`, any shell scripts.
