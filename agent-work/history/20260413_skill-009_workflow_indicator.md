# skill-009 — Pi workflow indicator

## Outcome

Implemented a Pi-only extension that shows a minimalist workflow rail for the tracked-work sequence:

`next-feature → prime → plan-md → execute → review → commit`

The rail appears above the editor, highlights the most recently invoked tracked workflow step, and stays intentionally non-authoritative. It is a navigation cue, not workflow completion state.

## Delivered

- Added `extensions/workflow-indicator.ts`
- Detected explicit `/skill:next-feature|prime|plan-md|execute|review|commit` via Pi `input` events
- Persisted minimal indicator state with a custom session entry
- Restored branch-local state on `startup`, `reload`, and `resume`
- Cleared state on `new`
- Wrote a cleared state on `fork` so forked sessions remain blank until used
- Rendered a single above-editor widget with muted inactive steps and one active highlighted step
- Added narrow-width fallback rendering (`index/total + active short label`)
- Synced repo `extensions/` into `~/.pi/agent/extensions/` through `sync-prompts.sh`
- Updated `README.md` and `docs/STRUCTURE.md` to document Pi extensions and the workflow rail behavior

## Design Notes Kept in the Implementation

- Single-file v1
- Single UI surface
- Quiet typographic styling using theme tokens
- Active-vs-muted rendering only
- No Pi core patch
- No second status surface

## Verification

Verified locally by:

- syncing prompts and confirming the extension lands in `~/.pi/agent/extensions/`
- loading Pi with the extension enabled
- invoking the tracked `/skill:*` commands and confirming the active step moves
- checking restore behavior for `startup`, `resume`, `new`, and `fork`
- checking compact rendering for narrow widths
- checking theme-sensitive rendering through a targeted extension smoke test

## Discovered Follow-up

- `pv-010` — fix the pre-existing `uv run pytest` collection failure caused by duplicate `test_pv_creation` module names in `bin/` and `tests/`
