---
name: review
description: Review finished work before reflection and commit.
---

Review the active task after implementation and before `/reflect`.

### Review Process

Verify: correctness (does it solve the task?), minimal surface area, no scope creep, no unnecessary abstractions, no AI bloat.

1. Identify the files changed during implementation. Exclude commit-step artifacts (plan archival and `features.yaml` completion updates), but include explicitly planned documentation deliverables.
2. Read them. Check that the change is as narrow as possible — flag duplication, unnecessary abstractions, pattern drift, or edits that widen the impact surface.
3. Check for residue: debug prints, commented-out code, TODO/FIXME markers from completed work, prompt-generated bloat.
4. For non-trivial changes, invoke the `code-critic` reviewer subagent once with the assembled file list.
5. Fix only clear, high-impact issues. Ignore low-confidence or out-of-scope feedback; re-run only after material changes.

### Boundaries

Do not:
- archive plans
- mutate `features.yaml`
- create a commit
- perform broad documentation updates; note reflection candidates instead

### Output

Report one of:

- `READY FOR REFLECT` — implementation has passed review; include any documentation/reflection candidates
- `REVIEW ISSUES` — list the blocking issues and the concrete fixes needed
