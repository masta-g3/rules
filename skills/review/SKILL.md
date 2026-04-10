---
name: review
description: Review finished work before archival and commit.
---

Review the active task after implementation and before `/commit`.

### Review Process

Verify: correctness (does it solve the task?), minimal surface area, no scope creep, no unnecessary abstractions, no AI bloat.

1. Identify the files changed during implementation. Exclude commit-step artifacts (plan archival, `features.yaml` updates, repo-doc sync).
2. Read them. Check that the change is as narrow as possible — flag duplication, unnecessary abstractions, pattern drift, or edits that widen the impact surface.
3. Check for residue: debug prints, commented-out code, TODO/FIXME markers from completed work, prompt-generated bloat.
4. For non-trivial changes, invoke the `code-critic` reviewer subagent once with the assembled file list.
5. Fix only clear, high-impact issues. Ignore low-confidence or out-of-scope feedback; re-run only after material changes.

### Boundaries

Do not:
- archive plans
- mutate `features.yaml`
- create a commit

### Output

Report one of:

- `READY FOR COMMIT` — include any brief caveats worth remembering
- `REVIEW ISSUES` — list the blocking issues and the concrete fixes needed
