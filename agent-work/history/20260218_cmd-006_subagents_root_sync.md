**Feature:** cmd-006 → Move subagents to repo root for multi-harness sync

## Summary

Relocate `.claude/agents/` to a top-level `agents/` directory (matching the `skills/` convention) and sync subagents to all three harnesses instead of Claude-only.

## Context Files

- **Core**: `sync-prompts.sh` (the only file referencing `.claude/agents/`)
- **Reference**: how `skills/` is already handled (lines 104-106, 165)

## Changes

### 1. Move the directory

```bash
git mv .claude/agents agents
```

Two files move: `code-critic.md`, `plan-critic.md`.

### 2. Update `sync-prompts.sh`

**Line 108** — replace the single Claude-only sync with three harness-neutral syncs:

```bash
# before
sync_dir "${repo_root}/.claude/agents/" "${claude_root}/agents/" "subagents"

# after
sync_dir "${repo_root}/agents/" "${codex_root}/agents/" "subagents"
sync_dir "${repo_root}/agents/" "${claude_root}/agents/" "subagents"
sync_dir "${repo_root}/agents/" "${cursor_root}/agents/" "subagents"
```

**Line 166** — update the print_row targets:

```bash
# before
print_row "subagents" "subagents" "claude"

# after
print_row "subagents" "subagents" "codex, claude, cursor"
```

### 3. Verify

- Run `./sync-prompts.sh` — confirm subagents row shows all three targets and files sync correctly.
- `ls ~/.codex/agents/` and `ls ~/.cursor/agents/` should contain `code-critic.md` and `plan-critic.md`.

## Implementation

- [x] Phase 1: `git mv .claude/agents agents`
- [x] Phase 2: Edit `sync-prompts.sh` (2 changes: line 108, line 166)
- [x] Phase 3: Run `./sync-prompts.sh` and verify output

That's it — one `git mv`, two line edits, one verification.
