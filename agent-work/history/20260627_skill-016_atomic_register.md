**Feature:** skill-016 → Atomic ticket registration helper

## Summary

Implemented `features_yaml.sh register` so agents can create tracked tickets under an epic without separately reserving an ID. The command computes the next `{epic}-{nnn}` value from the current `agent-work/features.yaml`, appends the feature in the same mutation, and returns the created ticket details.

## Implemented Changes

- Added `register` to `skills/_lib/features_yaml.py`:
  - accepts `--json` payloads with required `epic`
  - rejects caller-supplied `id`
  - defaults `status` to `pending`
  - defaults `created_at` to today
  - supports `--dry-run`, text output, JSON output, stdin JSON via `--json -`, and `describe register`
- Extracted shared next-ID calculation so `next-id` and `register` cannot drift.
- Kept existing `create`, `next-id`, `update`, `complete`, and `next` behavior intact.
- Updated `skills/ticket-init/SKILL.md` to use `register` instead of `next-id` followed by `create`.
- Added tests for:
  - next ID allocation and append behavior
  - rejection of explicit IDs
  - missing epic validation
  - dry-run non-mutation
  - stdin JSON input
- Updated durable guidance in `README.md`, `AGENTS.md`, and `docs/STRUCTURE.md` so future agents use `register` for ticket creation and treat `next-id` as inspection-only.

## Non-Goals

- No epic registry or semantic epic search was added.
- No schema migration was performed.
- No file locking was added; this phase only removes the normal stale-ID window between separate helper calls.

## Validation

- `uv run pytest tests/test_features_yaml_cli.py` → 21 passed
- `uv run pytest tests/test_features_yaml_cli.py -k 'register or json_dash'` → 5 passed
- Manual `mktemp -d` smoke test for `features_yaml.sh register --output json` → created `skill-001`

## Discovered Work

None.
