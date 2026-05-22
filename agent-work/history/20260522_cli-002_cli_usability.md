# cli-002 — Improve CLI Agent Usability

## Summary

Implemented the confirmed `cli-001` CLI usability findings for the tracked-work helper and `pv`/`fv` entrypoints without redesigning either tool.

The work keeps `skills/_lib/features_yaml.sh` as the deterministic automation surface for agents/scripts and keeps `bin/pv` / `bin/fv` as human TUI tools.

## Implemented Changes

### `features_yaml.sh` / `features_yaml.py`

- Added `get <feature-id>` for direct feature inspection.
  - `--output json` returns the full persisted feature mapping.
  - Text output shows compact human-readable status, priority, dependencies, plan file, and description.
- Added `--json -` support for `create` and `update` so JSON payloads can be piped through stdin.
- Made repeated identical `update` calls retry-safe:
  - no file rewrite when nothing changes
  - JSON response includes `changed: false` and `updated_fields: []`
- Improved update validation errors:
  - unsupported fields list the supported fields (`plan_file`, `status`)
  - `status: done` points users to `complete <feature-id> --plan-file ...`
- Improved `describe <feature-id>` recovery by preserving `describe` as command-contract help and pointing feature lookups to `get <feature-id> --output json`.
- Added focused argparse descriptions/examples for `get`, `create`, `update`, `complete`, and `describe`.

### `pv` / `fv`

- Clarified help text that `pv`/`fv` are human TUI tools.
- Directed agents/scripts to `skills/_lib/features_yaml.sh` for deterministic JSON/id output.
- Documented non-TTY behavior as a single read-only snapshot for inspection, not a machine-readable API.
- Added invalid-path recovery guidance with cwd context and examples.
- Applied the same invalid-path guidance to `fv` when no canonical `agent-work/features.yaml` exists.

### Documentation

- Updated `README.md` with the new helper contract, direct lookup, stdin JSON, no-op update semantics, and `pv`/`fv` role guidance.
- Updated `AGENTS.md` to point agents at `get <feature-id> --output json` and warn that `describe` explains helper commands, not feature IDs.

## Validation

- Baseline before implementation: `uv run pytest -q tests/test_features_yaml_cli.py tests/test_pv_creation.py` → 20 passed.
- Targeted after implementation: `uv run pytest -q tests/test_features_yaml_cli.py tests/test_pv_creation.py` → 29 passed.
- Full suite after review fixes: `uv run pytest -q` → 31 passed.
- Manual temp-directory smoke tests covered helper lookup, stdin JSON, no-op retry behavior, describe recovery, and `pv`/`fv` invalid-path guidance.
- `code-critic` review initially found one `fv` missing-backlog guidance gap; the gap was fixed and re-review returned LGTM.

## Scope Notes

Intentionally excluded:

- `create --if-missing`
- machine-readable `pv`/`fv` output
- broad CLI framework redesign
- changing `describe` to inspect feature IDs
