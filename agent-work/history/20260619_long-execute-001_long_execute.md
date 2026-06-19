# long-execute-001 — Long-execute workflow variant

## Summary

Implemented a Pi-only `long-execute` workflow variant for approved implementation plans that may need multiple bounded turns. The portable `execute` skill remains authoritative; `long-execute` adds only explicit continuation/stop labels and a Pi extension that safely injects visible follow-up user messages.

## Implemented

- Added `pi/skills/long-execute/SKILL.md` as a Pi-only skill prompt.
  - Reads `$SKILLS_ROOT/execute/SKILL.md` and follows it as the source of truth.
  - Uses `READY FOR REVIEW`, `BLOCKED — <reason>`, and exact final-line `LONG EXECUTE CONTINUE` labels.
  - Explicitly avoids `PENDING STEPS` when safe implementation work remains.
  - Requires a completion audit before terminal handoff labels.
- Added `extensions/long-execute.ts` as a minimal continuation controller.
  - Activates on `/skill:long-execute`.
  - Persists branch-local state with a default max of 6 continuation turns.
  - Continues only when the final assistant line is exactly `LONG EXECUTE CONTINUE`.
  - Stops on review readiness, blockers, user-input labels, missing marker, max-turn limit, manual user input, new sessions, and forks.
  - Provides `/long-execute-status` and `/long-execute-stop`.
- Updated `sync-prompts.sh` so `pi/skills/` overlays only into `~/.pi/agent/skills/`.
- Added structural tests for Pi-only skill sync, extension contract, continuation marker parsing, stop precedence, max-turn stop, and prompt safeguards.
- Updated `README.md` and `docs/STRUCTURE.md` to document Pi-only skills and long-execute behavior.
- Updated `AGENTS.md` to clarify requested `agent-work/decks/` HTML briefing artifacts are durable workflow artifacts, while failed preview exports/generated derivatives should be removed unless needed as evidence.
- Created `agent-work/decks/long-execute-001-briefing.html` as the requested maintainer briefing deck.

## Review Notes

Prompt review found two high-value issues, both incorporated:

- `PENDING STEPS` from `execute` would have stopped continuation, so long-execute now explicitly overrides that label when safe work remains.
- The exact final-line continuation marker requirement is now stated in both the skill prompt and continuation prompt.

Code review found one safety issue, fixed before commit:

- Stop labels now win even if a later final line says `LONG EXECUTE CONTINUE`.

The suggestion to remove the briefing deck was rejected because the deck was explicitly requested and planned.

## Verification

- `uv run pytest -q` → `38 passed`
- `uv run pytest -q tests/test_pi_extension_imports.py` → `9 passed`
- `pi --no-extensions -e ./extensions/long-execute.ts --list-models` → extension loads
- `./sync-prompts.sh --silent` → sync succeeds
- Verified `~/.pi/agent/skills/long-execute/SKILL.md` and `~/.pi/agent/extensions/long-execute.ts` exist after sync
- Verified Claude, Cursor, and Codex skill roots do not receive `long-execute`
