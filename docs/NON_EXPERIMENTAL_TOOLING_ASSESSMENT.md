# Non-Experimental Tooling Assessment

Audit scope: active workflow skills, deterministic helper scripts, deployment/install scripts, and the `pv` CLI.

Excluded on purpose: `skills/autopilot`, `skills/_lib/WORKFLOW.md`, `skills/_lib/FILE_LOCK.md`, `skills/_lib/workflow_state.sh`, and `skills/_lib/file_lock.sh`.

Audit method:
- Read the active workflow docs in `README.md`, `docs/STRUCTURE.md`, and all non-experimental `skills/*/SKILL.md` files.
- Exercised executable tooling with isolated fixtures and temporary `HOME` directories.
- Compared documented behavior with actual runtime behavior and current environment conventions.

## Executive Summary

The active toolchain is structurally sound and the core deterministic helpers do the right high-level jobs:
- `select_next_feature.sh` correctly prefers `in_progress` work, otherwise ready `pending` work.
- `archive_plan.sh`, `mark_done.sh`, `sync-prompts.sh`, `bin/install.sh`, and `bin/pv` all work on the happy path.
- The non-experimental workflow separation is clear: `plan-md` plans, `execute` activates, `commit` finalizes.

The main problems are not architectural. They are contract and ergonomics issues:
- one real helper bug in `feature_id.sh`
- two commit-helper safety gaps
- several places where the docs promise more than the tool actually returns
- a few usage descriptions that have drifted from current capabilities

## Priority Findings

### High

1. `skills/_lib/feature_id.sh` succeeds on a missing `features.yaml` and fabricates a new ID.
   - Reproduced result: running it against a nonexistent file printed `auth-001`, emitted a `yq` error on stderr, and exited `0`.
   - Impact: any workflow that trusts the exit code can silently create incorrect backlog IDs instead of failing fast.
   - Recommendation: explicitly check `[[ -f "$FEATURES_FILE" ]]` up front and exit non-zero with a clear error.

### Medium

1. `skills/commit/scripts/archive_plan.sh` silently overwrites an existing archive target.
   - Reproduced result: if `docs/history/YYYYMMDD_auth-001_user_signup.md` already exists, a second archive with the same feature/date/short description replaces it.
   - Impact: history loss is possible if a user retries `/commit` or reuses the same short description on the same day.
   - Recommendation: fail when the target exists, or append a collision suffix.

2. `skills/commit/scripts/mark_done.sh` does not verify that the archive path exists before writing it into `features.yaml`.
   - Reproduced result: it accepted `docs/history/missing.md` and marked the feature `done`.
   - Impact: `plan_file` can point at a nonexistent file, which breaks the backlog/documentation contract.
   - Recommendation: require the provided archive path to exist before mutating `features.yaml`.

3. `next-feature` documentation promises diagnosis the helper does not provide.
   - Documented in `skills/next-feature/SKILL.md`: when no features are ready, check for circular dependencies and blocked prerequisites.
   - Actual helper output: `No ready features in all features. 2 pending, 2 blocked by unresolved dependencies.`
   - Impact: the user may have to retry or manually inspect `features.yaml` to get the actionable information the skill says it will provide.
   - Recommendation: either reduce the prompt contract to match the helper, or upgrade the helper to list blocked IDs and detect simple dependency cycles.

### Low

1. `README.md` still describes `ticket-init` as adding a single ticket.
   - Current skill contract supports multi-ticket input via `ticket 1 || ticket 2`.
   - Recommendation: update the README skill table and add one example.

2. Several skill docs still refer to provider-specific or outdated execution terms.
   - `plan-md`, `epic-init`, and `project-init` mention `AskUserQuestion`.
   - `plan-md`, `execute`, and `commit` mention the `Task tool`.
   - In this repo's current environment, the concrete primitives are plain assistant questions plus subagents under `agents/`.
   - Recommendation: rename those references to neutral wording such as "ask the user directly" and "invoke a subagent".

3. `sync-prompts.sh` supports `--clean`, `--silent`, and `-q`, but the README only documents `./sync-prompts.sh`.
   - Recommendation: document the flags and note the Claude statusline side effect.

4. `bin/pv` emits ANSI-colored output even in non-interactive mode.
   - Impact: piped output is harder to read or parse.
   - Recommendation: disable ANSI when `stdout` is not a TTY, or add a `--plain` flag.

## Tool-by-Tool Assessment

## Workflow Skills

| Tool | Current usage description | Assessment |
|------|---------------------------|------------|
| `prime` | Read `docs/STRUCTURE.md`, related files, and `git log --oneline -10` before work. | Clear and aligned with current repo practice. No functional issue found. Improvement: say when to stop reading to avoid over-priming on large repos. |
| `plan-md` | Create a scoped plan in `docs/plans/`, create a ticket first when needed, keep tracked work `pending`. | Core lifecycle contract is good. Low-level drift: references to `AskUserQuestion` and `Task tool` are environment-specific. Improvement: include one concrete example of setting `plan_file` when planning a newly created tracked ticket. |
| `execute` | Implement from the plan, run baseline verification, move tracked work to `in_progress`, log discovered work. | Lifecycle ownership is clear and matches `docs/STRUCTURE.md`. Low-level drift: refers to a testing subagent via `Task tool`, but no dedicated testing agent is defined here. Improvement: specify the exact `yq` mutation for `pending -> in_progress`. |
| `commit` | Review, archive the plan, mark the feature done, then commit only session files. | Conceptually strong, but helper safety is weaker than the doc contract. The code review subagent is real (`agents/code-critic.md`), but "Task tool" wording is stale. Improvement: tell the user how to derive `<short-desc>` consistently. |
| `next-feature` | Review recent git state, select the next actionable feature, keep `features.yaml` unchanged. | Core recommendation semantics are correct. Main misspecification is the promised blocked/cycle diagnosis that the helper does not actually emit. Improvement: include a one-line explanation of why the recommended item won. |
| `ticket-init` | Determine epic, generate ID, append backlog entry, support `||` multi-ticket input. | Skill contract is good and minimal. Runtime quality depends on `feature_id.sh`, which currently has the missing-file bug. Improvement: report the created `plan_file` as `null` explicitly only if the user needs schema-level detail; otherwise the current output is fine. |
| `epic-init` | Decompose into 4-10 atomic features, create `docs/plans/{epic}-000.md`, register children through `ticket-init`. | Good ownership boundaries. Minor drift: it mentions `AskUserQuestion` terminology rather than repo-neutral language. Improvement: explicitly say that the recommended starting feature should usually be the first priority-1 feature with no dependencies. |
| `project-init` | Scaffold a new project, create `features.yaml`, `README.md`, `docs/STRUCTURE.md`, then commit. | The workflow is coherent but intentionally high-trust. Improvement: document whether the initial commit should happen automatically or only after the user reviews the scaffold. |
| `test-coverage` | Survey test infra, identify critical gaps, propose 3-7 tests, implement on confirmation. | Clear and lightweight. No bug found. Improvement: mention how to behave when there is no coverage tooling but test runners exist. |

## Deterministic Helpers and Scripts

| Tool | Documented usage | Observed behavior | Assessment |
|------|------------------|-------------------|------------|
| `skills/_lib/select_next_feature.sh` | Used by `next-feature`; optional `--id` mode for machine consumers. | Correctly resumes `in_progress` work first and scopes by epic. Human output is concise and useful. | Good core behavior. Improvement: no-ready mode should identify blocked feature IDs and missing dependencies, not just counts. |
| `skills/_lib/feature_id.sh` | Used by `ticket-init` and `execute` to generate the next `{epic}-{nnn}` ID. | Correct on valid files. Incorrectly exits `0` and prints a new ID when the file is missing. | Real bug. Fix before relying on it in more workflows. |
| `skills/commit/scripts/archive_plan.sh` | Move `docs/plans/*.md` to `docs/history/` and return the final path. | Works on the happy path and returns the final archive location. Overwrites on path collision. | Safety gap. Add collision handling. |
| `skills/commit/scripts/mark_done.sh` | Set `status: done`, `completed_at`, and `plan_file`. | Works on existing features. Does not validate the supplied archive path. | Safety gap. Validate the archive path before writing it. |
| `sync-prompts.sh` | Sync AGENTS, skills, subagents, and Claude statusline into provider homes. | Works with temporary `HOME`; flags `--clean`, `--silent`, and `-q` behave. Claude statusline injection only runs if `~/.claude/settings.json` already exists. | Good script, under-documented. Improvement: document flags and the statusline behavior. |
| `bin/install.sh` | Install `pv` and `fv` into `~/.local/bin`. | Works with temporary `HOME`; prints a useful PATH warning. | Good. Improvement: mention that it replaces an existing `fv` symlink. |
| `bin/pv` | Portfolio/project TUI for browsing and editing `features.yaml`. | `--help` works; direct file mode and non-interactive rendering work. Non-interactive output still contains ANSI sequences. | Good CLI, output could be friendlier for piping and scripted use. |

## Output Quality Review

### Good outputs

- `select_next_feature.sh` now gives both a canonical recommendation and nearby alternatives.
- `sync-prompts.sh` prints a compact, high-signal deployment summary.
- `bin/install.sh` gives immediate next-step guidance after installation.

### Outputs that should improve

1. `select_next_feature.sh` no-ready path
   - Current: summary counts only.
   - Better: list the first few blocked features and their unmet dependencies.

2. `feature_id.sh` error path
   - Current: stderr from `yq`, plus a false-success ID on stdout.
   - Better: one clean error line and non-zero exit.

3. `archive_plan.sh` collision path
   - Current: silent overwrite.
   - Better: explicit failure message naming the conflicting archive file.

4. `bin/pv` non-interactive mode
   - Current: ANSI-decorated frame output.
   - Better: plain text by default when piped, optionally colorized via a flag.

## Recommended Fix Order

1. Fix `skills/_lib/feature_id.sh` to fail on missing files.
2. Add collision protection to `skills/commit/scripts/archive_plan.sh`.
3. Make `skills/commit/scripts/mark_done.sh` require an existing archive path.
4. Decide whether `next-feature` should be more diagnostic or less ambitious, then align the helper and the skill doc.
5. Clean up documentation drift in `README.md` and the skill wording around subagents/question tools.
6. Improve ergonomics for `sync-prompts.sh` flags and `bin/pv` non-interactive output.

## Reproduction Notes

Commands exercised during this audit included:

```bash
python3 bin/pv --help
HOME="$(mktemp -d)" ./sync-prompts.sh --silent
HOME="$(mktemp -d)" ./bin/install.sh
skills/_lib/select_next_feature.sh <fixture>
skills/_lib/select_next_feature.sh --id <fixture> [epic]
skills/_lib/feature_id.sh <fixture> auth
skills/commit/scripts/archive_plan.sh <plan> <short_desc>
skills/commit/scripts/mark_done.sh <feature-id> <archive-path>
```

Fixture checks covered:
- active work taking precedence over ready pending work
- epic-filtered selection
- no-ready dependency cycles
- missing `features.yaml` for `feature_id.sh`
- archive path collision behavior
- nonexistent archive path acceptance in `mark_done.sh`
