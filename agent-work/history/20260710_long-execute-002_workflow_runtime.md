# Consolidated workflow runtime

**Feature:** `long-execute-002`
**Outcome:** Implemented and reviewed

## Objective

Consolidate Pi workflow tracking and bounded long-execute continuation into one runtime that survives compaction, prevents duplicate continuations, and stops safely at stronger session boundaries.

## Final design

```text
extensions/workflow-runtime/
├── index.ts   # Pi lifecycle wiring, persistence, rail, prompts, custom messages
└── core.ts    # Dependency-free transitions and continuation queue guard
```

The runtime is the sole owner of workflow step, ticket, and long-execute state. The model-facing execution policy remains in `pi/skills/long-execute/SKILL.md`.

### Runtime invariants

- Long execution is active only while `WorkflowState.execution` exists.
- Each invocation receives a `runId`; queued callbacks deliver only while that run remains active.
- At most one continuation can be queued at a time.
- Continuation requires `LONG EXECUTE CONTINUE` as the exact final non-empty assistant line.
- Review readiness, blockers, invalid/missing markers, manual interruption, and the sixth completed turn stop automatic execution.
- Manual, threshold, and overflow compaction preserve state without directly queueing work.
- Reload, restored startup/resume, new session, and fork never silently resume execution.

### UI and model context

- The workflow rail remains the only persistent status surface and pulses between `LEX ✦` and `LEX ✧` during long execution.
- Continuations use a compact one-line custom event with expandable details, `triggerTurn: true`, and `deliverAs: "followUp"`.
- Every active agent turn receives a concise contract containing ticket context, turn progress, execute-policy authority, and valid terminal labels.

### Deployment

`sync-prompts.sh` now overlays repository extensions into Pi's extension directory, removes only the two replaced legacy files, and preserves unrelated user extensions even with `--clean`:

- removed `extensions/workflow-indicator.ts`
- removed `extensions/long-execute.ts`
- added `extensions/workflow-runtime/`

## Tests

Added dependency-free Node behavioral tests, invoked through pytest, for:

- activation and unified state
- exact final-line continuation
- stop-label precedence
- six-turn limit
- compaction identity
- interruption and session boundaries
- queue deduplication and stale-run rejection
- safe extension sync migration
- current Pi package and custom-message wiring

## Review refinements

- Changed collapsed continuation rendering to one row.
- Removed duplicate ticket injection from active long-execute prompts.
- Replaced tautological marker tests with the literal public marker.
- Removed structural assertions that unnecessarily locked internal helper names.

## Verification

- `uv run pytest -q` → 50 passed after review.
- Pi extension load check exited successfully.
- Temporary-HOME sync tests passed for default and `--clean` modes.
- TUI smoke tests verified ticket commands, rail pulse, one-line collapsed continuation rendering, and expanded details.
- An isolated real Pi run completed a two-turn plan: the first turn emitted `LONG EXECUTE CONTINUE`, the runtime triggered the second turn, and `READY FOR REVIEW` stopped long mode.

## Durable documentation

- `README.md` describes the consolidated runtime and operator lifecycle behavior.
- `docs/STRUCTURE.md` records the `index.ts` / `core.ts` responsibility boundary.
