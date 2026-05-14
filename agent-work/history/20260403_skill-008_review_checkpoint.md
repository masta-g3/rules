**Feature:** skill-008 → Add a review checkpoint before commit

## Outcome

The default workflow now inserts an explicit `review` step before `commit`.

Recommended flow:

```text
prime -> plan-md -> execute -> review -> commit
```

This gives maintainers a clean inspection point after implementation and before archival, `features.yaml` completion, and git commit.

## Implemented Decisions

### Workflow ownership

- `execute` stays focused on implementation and verification.
- `review` is the pre-commit gate for finished implementation work.
- `commit` now focuses on finalization: archive the plan, complete tracked work, sync repo docs, and create the commit.

### Review behavior

- Added a new `skills/review/SKILL.md` entrypoint.
- `review` inspects the explicit pre-finalization implementation file set.
- For non-trivial changes, `review` invokes `code-critic` on that file set.
- `code-critic` is advisory; the parent reviewer may ignore suggestions that depend on missing context or widen scope.
- `review` explicitly checks for narrow scope, pattern fit, unnecessary abstractions, and leftover debug/prompt residue.

### Commit behavior

- Removed code-review ownership from `skills/commit/SKILL.md`.
- Kept `commit` responsible for:
  - plan archival and concise archive compaction
  - `features.yaml` completion for tracked work
  - repo-doc sync such as `docs/STRUCTURE.md`, `README.md`, and nearby guides
  - commit scoping and commit creation
- Tightened commit scoping so the agent checks staged state and asks the user before unstaging unrelated staged files.

### Autopilot and docs

- Updated autopilot/manual workflow references to include `/review`.
- Updated the experimental workflow contract so autopilot can advance `execute -> review -> commit`.
- Updated top-level docs and structure docs to describe the new default workflow.

## Files Updated

- `skills/review/SKILL.md`
- `skills/execute/SKILL.md`
- `skills/commit/SKILL.md`
- `agents/code-critic.md`
- `README.md`
- `docs/STRUCTURE.md`
- `skills/autopilot/SKILL.md`
- `skills/_lib/WORKFLOW.md`
- `.claude/scripts/workflow.sh`
- `features.yaml`

## Verification

- Ran `uv run pytest tests/test_features_yaml_cli.py -q`
- Ran `bash -n .claude/scripts/workflow.sh skills/_lib/workflow_state.sh skills/autopilot/scripts/start_workflow.sh`
- Ran `git diff --check` on the edited workflow files
- Re-ran `code-critic` on the review-workflow file set and addressed the reported issues

## Notes

- Repo-doc sync remains a commit-time responsibility by design.
- If documentation itself is the main deliverable, that work should still go through its own normal plan/execute/review flow.
