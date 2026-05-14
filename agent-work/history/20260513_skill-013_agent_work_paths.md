**Feature:** skill-013 → Move workflow artifacts to canonical `agent-work/` paths.

## Summary

Moved agent-produced workflow state out of root/`docs/` locations into a dedicated `agent-work/` tree while keeping `docs/` reserved for durable documentation.

Canonical workflow paths are now:

- `agent-work/features.yaml` — tracked backlog and source of truth
- `agent-work/plans/` — active implementation plans
- `agent-work/history/` — archived plans and workflow notes
- `agent-work/tickets/` — ticket-local scripts, logs, and validation artifacts

## Implemented Changes

- Moved the repository backlog from root `features.yaml` to `agent-work/features.yaml`.
- Moved active plans from `docs/plans/` to `agent-work/plans/`.
- Moved historical workflow artifacts from `docs/history/` to `agent-work/history/`.
- Added `agent-work/tickets/.gitkeep` so the ticket artifact directory exists in fresh checkouts.
- Updated backlog `plan_file` and plan references to use `agent-work/...` paths.
- Updated workflow skills and agent guidance to write plans/history/ticket artifacts under `agent-work/` and keep durable docs in `docs/`.
- Updated `features_yaml.py` defaults, command specs, missing-file text, and suggested plan paths to use `agent-work/features.yaml` and `agent-work/plans/`.
- Updated commit archiving and file-lock defaults to `agent-work/history/` and `agent-work/plans/.file-locks.json`.
- Updated `pv`/`fv` to discover canonical `agent-work/features.yaml` files, keep project roots distinct from `agent-work/`, and avoid automatic legacy root backlog discovery.
- Updated README, structure docs, install output, and tests for the new canonical paths.

## Decisions

- No automatic fallback to legacy root `features.yaml` was added. Projects using old paths should be migrated explicitly.
- Explicit file arguments remain supported, including `--file <path>` for helper commands and `pv <path-to-yaml>` for direct TUI use.
- Portfolio scanning discovers only canonical `agent-work/features.yaml` files to avoid duplicate project discovery.
- `ProjectSummary.path` remains the project root when loading `agent-work/features.yaml`, so project names, archive markers, and navigation stay correct.

## Validation

- `uv run pytest -q` → 20 passed.
- `git diff --check` passed.
- Helper smoke confirmed default `next` resolves `skill-013` from `agent-work/features.yaml`.
- Archive script smoke confirmed archives are written to `agent-work/history/` and collisions fail.
- `pv` smoke confirmed both `python3 bin/pv agent-work/features.yaml` and `python3 bin/pv .` render successfully.
- Review and code-critic re-review passed; final code-critic result: `LGTM`.

## Discovered Work

None.
