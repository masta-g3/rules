**Feature:** cmd-002 — File reservation system for parallel agents

## Summary

Cooperative file-lock mechanism so multiple agents working on different features can avoid modifying the same file simultaneously. Presence-based toggle via `docs/plans/.file-locks.json`.

Lightweight alternative to full worktree isolation: agents share a single worktree and coordinate via an advisory lock file. Works in any environment (Codex, Cursor, Claude Code).

## What was implemented

- [x] Added `<file_reservations>` protocol section to AGENTS.md
- [x] Added `--parallel` flag and conflict check to `/plan-md`
- [x] Added reserve/release cycle to `/execute`
- [x] Added cleanup step to `/commit`

## Architecture

```
                     ┌─────────────────────────────┐
                     │ docs/plans/.file-locks.json  │
                     │  (presence = toggle ON)      │
                     └────────┬────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
   /plan-md              /execute              /commit
   --parallel flag       reserve → write →     cleanup for feature
   creates lock file     release               delete file if empty
   conflict check        poll if held
```

## Lock File Schema

```json
{
  "src/utils/format.py": { "by": "auth-001", "at": "2026-01-30T10:30:00Z" }
}
```

Top-level object. Key = relative file path, value = `{ "by": feature-id, "at": ISO timestamp }`.

- File absent: reservations disabled (single-agent mode)
- File present with `{}`: reservations enabled, nothing locked
- File present with entries: active locks

## Protocol

1. **Reserve**: before modifying a file, add entry via jq
2. **Release**: after modification, remove entry via jq
3. **Poll**: if file is held by another feature, sleep 15s, retry up to 5 times, then warn user
4. **Cleanup**: `/commit` removes all entries for the current feature; deletes file if empty

Advisory/cooperative locking — not atomic. Feature ID derived from active plan file name.
