# CLI Assessment: cli-001

## Executive Summary

The agent-facing helper (`skills/_lib/features_yaml.sh`) is reliable for basic non-interactive workflows and already has useful `--output id/json` modes, dry-run support, and safe temp-project behavior. The main usability issues are discoverability and automation polish: no direct feature lookup command, sparse help without examples, non-actionable recovery for `describe <feature-id>`, no stdin JSON input, and `update` reporting `changed: true` even when repeated with identical values.

`bin/pv` / `bin/fv` work well as human TUIs and safely render once in non-TTY mode, but their help does not clearly state that agents/scripts should prefer `features_yaml.sh` for deterministic mutations and machine-readable output.

## Method

Assessment used one deterministic baseline plus four targeted subagent user-like tests. All mutable work happened in temporary fixture projects under `agent-work/tickets/cli-001/tmp/`; the repo backlog was not used as test data.

Artifacts:

- Baseline: `agent-work/tickets/cli-001/baseline.md`
- Prompts: `agent-work/tickets/cli-001/prompts/`
- Transcripts: `agent-work/tickets/cli-001/transcripts/`

Personas:

1. Fresh workflow agent — discover next feature, attach plan, verify state
2. Error recovery agent — intentionally run likely wrong commands
3. Pipeline automation agent — compose shell workflow, test retry behavior and stdin JSON
4. pv/fv human-like user — inspect help, non-TTY render, invalid paths, helper distinction

## Tested Surfaces

| Surface | Role | Result |
|---|---|---|
| `skills/_lib/features_yaml.sh` | Agent/script backlog helper | Functionally solid; needs better help/errors and a direct lookup path. |
| `skills/_lib/features_yaml.py` | Helper implementation | Argparse contract is simple; some output semantics need refinement. |
| `bin/pv` | Portfolio/project TUI | Human-friendly; non-TTY snapshot works; help underspecifies script behavior. |
| `bin/fv` | Project-focused TUI alias | Same as `pv`; good for human inspection, not machine output. |

## Findings

| ID | Surface | Severity | Persona | Evidence | Impact | Candidate Fix | Regression Test |
|---|---|---|---|---|---|---|---|
| CLI-F01 | `features_yaml` | High | Fresh workflow | After `update tui-002 --json ...`, agent used `next --output json` plus direct YAML inspection because there is no `get/show FEATURE_ID`. | Agents cannot verify arbitrary feature state directly; encourages YAML parsing or misuse of `describe`. | Add `get` or `show` command: `features_yaml.sh get tui-002 --output json/text`. Include complete feature fields. | Temp fixture: update `plan_file`, run `get tui-002 --output json`, assert full persisted state. |
| CLI-F02 | `features_yaml` | Medium | Error recovery | `features_yaml.sh describe tui-002` exits 1 with `unknown command for describe: tui-002`. | Error does not explain that `describe` accepts helper command names, not feature IDs; likely repeats the observed real-world failure. | Improve error: list valid describe commands and point feature lookup to `get/show` once available. | Assert stderr contains valid command names and example invocation. |
| CLI-F03 | `features_yaml` | Medium | Fresh workflow / pipeline | `printf '{...}' \| features_yaml.sh update tui-002 --json -` fails with JSON decode error because `-` is parsed literally. | Natural pipeline usage is blocked; agents must construct fragile shell-quoted JSON. | Support `--json -` or `--stdin` for `create` and `update`. | Pipe JSON into update/create in temp fixture and assert success. |
| CLI-F04 | `features_yaml` | Medium | Pipeline | Repeating identical `update` leaves file hash unchanged but returns `changed: true` and lists updated fields. | Retry-safe state is good, but automation cannot distinguish no-op from mutation. | Compute whether patch changes values; emit `changed:false` and avoid rewriting file for no-op updates. | Run update twice; assert second JSON has `changed:false` and file mtime/hash unchanged. |
| CLI-F05 | `features_yaml` | Medium | Fresh workflow / error recovery | `update --help` shows syntax but no examples or allowed JSON keys; `unsupported update field(s): priority` omits allowed fields. | Agents must discover `describe update` or inspect source to know allowed patch fields. | Add examples and allowed keys to `update --help`; improve unsupported-field error with `supported fields: status, plan_file`. | Assert `update --help` includes examples and supported fields; assert error lists allowed fields. |
| CLI-F06 | `features_yaml` | Low/Medium | Error recovery | `update --json '{"status":"done"}'` says `use complete for done` but omits required `--plan-file`. | Recovery is possible but incomplete; agent needs another failed command or help lookup. | Include complete example: `features_yaml.sh complete tui-002 --plan-file agent-work/history/tui-002.md`. | Assert stderr contains `complete` and `--plan-file`. |
| CLI-F07 | `features_yaml` | Low | Pipeline | Duplicate `create` exits 1 with `feature already exists`. | Good for preventing duplicates; not idempotent for retry-heavy flows. | Optional: add `create --if-missing` only if real workflows need retry-safe creation. | If implemented, duplicate create with flag returns unchanged/no-op. |
| CLI-F08 | `pv/fv` | Medium | pv/fv user | `pv --help` / `fv --help` do not distinguish human TUI usage from agent/script helper usage. | Agents may choose decorative TUI output for automation instead of `features_yaml.sh`. | Add help note: humans use `pv/fv`; agents/scripts use `skills/_lib/features_yaml.sh` for deterministic YAML operations. | Assert help includes `features_yaml.sh` and “agents/scripts” wording. |
| CLI-F09 | `pv/fv` | Low/Medium | pv/fv user | Non-TTY `fv < /dev/null` exits 0 with a decorative snapshot, but help does not document this behavior. | Useful behavior is hidden; output could be mistaken for machine-readable data. | Document non-TTY snapshot behavior and clarify it is for inspection, not parsing. | Assert help includes non-TTY/snapshot note. |
| CLI-F10 | `pv/fv` | Low | pv/fv user | Invalid path errors are terse: `Error: does-not-exist not found`. | Human can recover, but examples/cwd context would be faster. | Add examples: `pv .`, `pv agent-work/features.yaml`, `fv` from project root. | Run invalid path and assert stderr/stdout includes example usage. |

## Recommended Next Fixes

Prioritize in this order:

1. Add `features_yaml.sh get/show FEATURE_ID --output text|json`.
2. Improve `describe <bad>` and common error messages with valid commands/examples.
3. Add examples and supported fields to helper subcommand help.
4. Support `--json -` stdin payloads for `create/update`.
5. Make repeated no-op `update` emit `changed:false`.
6. Clarify `pv/fv` help: human TUI vs agent helper, non-TTY snapshot behavior.

## Do Not Fix Yet

- Do not replace argparse or restructure the helper command tree; current architecture is sufficient.
- Do not make `pv/fv` machine-readable unless a real workflow needs it; the helper already fills that role.
- Do not add broad mutation fields to `update` just because `priority` was tested; unsupported fields are intentional unless requirements change.
- Do not implement `create --if-missing` unless retry-safe creation becomes a confirmed workflow need.

## Regression Test Candidates

Add tests in `tests/test_features_yaml_cli.py` for any implemented helper fix:

- `get/show` returns complete feature details and errors clearly for missing IDs.
- `describe tui-002` error lists valid describe targets and points to `get/show`.
- `update --help` includes examples and supported fields.
- `update --json -` reads stdin.
- repeated identical `update` returns `changed:false` and leaves file unchanged.
- `status: done` via update error includes `complete ... --plan-file` guidance.

For `pv/fv`, lightweight tests can call `bin/pv --help` and invalid paths without entering TTY mode.

## Reflection Candidates

- `README.md`: clarify that `features_yaml.sh` is the canonical agent/script API, while `pv/fv` are human inspection/editing TUIs.
- `docs/STRUCTURE.md`: update CLI responsibility boundaries if follow-up fixes add `get/show` or stdin JSON.
- CLI-for-agents skill: preserve this persona-based assessment pattern if it proved reusable.

## Raw Evidence Index

| Artifact | Purpose |
|---|---|
| `baseline.md` | Reproducible help/success/error command captures |
| `transcripts/helper-new-agent.md` | Fresh agent discoverability and verification behavior |
| `transcripts/helper-error-recovery.md` | Error message actionability |
| `transcripts/helper-pipeline-agent.md` | Pipeline, stdin JSON, idempotency observations |
| `transcripts/pv-fv-human-user.md` | TUI help, non-TTY behavior, invalid-path observations |
