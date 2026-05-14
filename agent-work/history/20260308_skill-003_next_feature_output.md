**Feature:** skill-003 -> Improve next-feature output

## Summary

This change made `/next-feature` more informative for humans without changing the deterministic selection rules used by automation.

The command now shows:

- all current `in_progress` features
- up to three next ready `pending` options
- one canonical `RECOMMENDED NEXT` item

The machine-safe `--id` mode remains unchanged.

## Implemented Changes

### Selector behavior

- `skills/_lib/select_next_feature.sh` now derives ordered `in_progress` and ready `pending` lists once, then uses them for both report output and `--id`
- non-`--id` mode now prints:
  - `IN PROGRESS`
  - `READY OPTIONS`
  - `RECOMMENDED NEXT`
- `READY OPTIONS` is capped at `3`
- the helper still honors the optional epic filter in both report mode and `--id`
- when no work is actionable, the helper still uses the no-ready summary path instead of inventing a recommendation

### Documentation

- `skills/next-feature/SKILL.md` now documents the richer report format
- suggested plan paths now match the repo convention: `docs/plans/{id}.md`

## Verification

- `python3 bin/pv --help`
- `bash -n skills/_lib/select_next_feature.sh`
- `bash -n skills/autopilot/scripts/start_workflow.sh`
- fixture checks confirmed:
  - ready pending selection still returns the same top item via `--id`
  - active work still takes precedence via `--id`
  - epic-filtered selection still scopes correctly
  - missing `features.yaml` still makes `--id` exit `1`
  - no actionable work still makes `--id` exit `1`
  - report mode shows empty sections only when a recommendation still exists
  - report mode limits ready options to `3`
- `skills/autopilot/scripts/start_workflow.sh` still worked in:
  - `single` mode
  - `continuous` mode with an explicit epic filter

## Outcome

`/next-feature` now gives users a quick view of active work plus nearby ready choices, while helper-backed automation keeps the same selection contract and failure behavior.
