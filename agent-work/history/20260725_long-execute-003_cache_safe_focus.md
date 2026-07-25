# Cache-safe focus reminders

**Feature:** `long-execute-003`
**Completed:** 2026-07-25

## Objective

Keep focus mode reliable across automatic continuation, ordinary user input, and compaction without adding dynamic focus guidance to Pi's system prompt. Ensure every reminder directs the agent to exit with `end_focus` when work is complete or blocked.

## Final Design

- Normal `stop` completion sends a visible custom follow-up message and triggers the next focus turn.
- Idle ordinary input marks a recovery reminder pending; `before_agent_start` injects it as a persistent custom message with `display: false`.
- Streaming input stays inside the existing focused run and does not add a duplicate reminder.
- Overflow compaction clears any pending next-run reminder and sends one hidden steering message before retry.
- Manual and threshold compaction do not add duplicate reminders; the next visible continuation or ordinary input supplies the needed context.
- Turn count remains in custom-message metadata for the TUI renderer and is omitted from model-visible content.
- Outside focus mode, the existing active-ticket system-prompt addition remains unchanged.

The shared reminder tells the agent to follow `execute` and the active plan when present, verify repository progress, take the next concrete step, and call `end_focus` with `completed` or `blocked` plus a concise summary. It explicitly prohibits stopping at a progress report or leaving focus active after either exit condition.

## Implementation

- Removed the dynamic `focusContract()` system-prompt injection.
- Consolidated continuation and recovery guidance in `continuationContent(state)`.
- Added a dependency-free recovery policy for idle input, streaming input, compaction retry, and next-run delivery.
- Reused the existing workflow custom-message type for visible continuation and hidden recovery events.
- Cleared pending recovery state on focus activation/exit, workflow changes, and session boundaries.
- Preserved concurrent workflow-definition persistence, stop-reason handling, `StringEnum`, notification, and renderer changes already present in the worktree.
- Synced `extensions/workflow-runtime/` into the installed Pi extension directory.

## Files

- `extensions/workflow-runtime/core.ts`
- `extensions/workflow-runtime/index.ts`
- `tests/workflow_runtime.test.mjs`
- `tests/test_pi_extension_imports.py`
- `README.md`
- `docs/STRUCTURE.md`

## Verification

- `uv run pytest -q` — 54 passed.
- `node --test tests/workflow_runtime.test.mjs` — 15 passed.
- `git diff --check` — passed.
- Isolated Pi extension-load smoke test — passed.
- Isolated focus run produced one visible `workflow-runtime-event`, continued automatically, then stopped after `end_focus`.
- Session inspection confirmed focus guidance is stored at the transcript tail; provider reporting showed cached-token reuse on the final call.
- Independent testing and code-review subagents found no remaining behavioral issues. One source-structure test was loosened to avoid locking private helper names.

## Documentation

- `README.md` explains visible continuation, paused focus recovery, and hidden recovery reminders.
- `docs/STRUCTURE.md` records custom transcript messages as the cache-safe focus-delivery pattern.

## Discovered Work

None.
