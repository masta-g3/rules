**Feature:** skill-006 → Simplify the shared features CLI for agent use

## Outcome

The shared `features.yaml` workflow now uses one canonical repo-local helper entrypoint:

```bash
./skills/_lib/features_yaml.sh
```

The helper contract is:

- `epics`
- `next-id <epic>`
- `next [--epic <epic>]`
- `create --json '<feature-object>'`
- `update <feature-id> --json '<partial-object>'`
- `complete <feature-id> --plan-file <archive-path>`
- `describe [command]`

This replaces the older command mix built around `list-epics`, `append-json`, `set-status`, `set-plan-file`, `mark-done`, and the thin wrapper scripts that duplicated those entrypoints.

## Key Decisions

- Keep `features_yaml.sh` as the only supported interface. `features_yaml.py` remains an implementation detail.
- Use explicit subcommands with one argument style instead of positional heuristics.
- Keep `update` narrow in v1: only `status` and `plan_file` are writable.
- Keep `complete` separate because it encodes a workflow transition, not a generic field patch.
- Add `describe` for lightweight runtime introspection rather than a larger schema system.

## Implementation Summary

- Rewrote `skills/_lib/features_yaml.py` around `argparse`.
- Added `--output json` for read commands and `--output id` for `next`.
- Added `--dry-run` for `create`, `update`, and `complete`.
- Hardened common agent-error paths:
  - malformed JSON payloads
  - invalid tracked IDs
  - unsupported patch fields
  - invalid mutable status values
  - missing archive path on `complete`
- Updated workflow skills and repo docs to use the new command set.
- Removed the obsolete wrapper scripts:
  - `skills/_lib/feature_id.sh`
  - `skills/_lib/select_next_feature.sh`
  - `skills/commit/scripts/mark_done.sh`

## Verification

- Added focused CLI regression coverage in `tests/test_features_yaml_cli.py`.
- Verified:
  - `epics` and `next-id` JSON output
  - `next` recommendation semantics and blocked diagnostics
  - `update` for `status` and `plan_file`
  - `complete` archive validation and completion fields
  - `--dry-run` behavior for mutations
- Synced prompts with `./sync-prompts.sh --silent`.
- Ran parallel subagent drills against the migrated skill docs; common tasks mapped to the intended commands in one shot or with only the expected `next-id` then `create` sequence for ticket creation.

## Notes

- The main workflow now relies on repo-local helper logic instead of user-installed `yq` / `jq` for supported `features.yaml` operations.
- Existing `pv` creation tests remain independently broken due to their module-loading path and were not changed as part of this feature.
