---
name: review
description: Review finished work before reflection and commit.
metadata:
  thinkingLevel: high
---

Review the active task after implementation and before `/reflect`.

### Review Process

Verify correctness, minimal surface area, and reuse of existing patterns. Flag scope creep, unnecessary abstractions or one-use wrappers/classes, broad exception handling or silent fallbacks, unrequested compatibility layers, and other AI bloat.

1. Identify the files changed during implementation. Exclude commit-step artifacts (plan archival and `agent-work/features.yaml` completion updates), but include explicitly planned documentation deliverables.
2. Read them and verify against the task: does the change solve it, did the plan's verification steps actually run and pass, and did scope stay within the plan? Ask whether the same task could have been solved with a simpler, smaller change — flag scope creep, plan overreach, or edits that widen the impact surface.
3. Check session and `agent-work` hygiene: temporary test scripts, generated outputs, scratch files, and `agent-work` artifacts that are not needed for active plans, review, reproduction, evidence, requested decks, or archived history.
4. For non-trivial changes, invoke the `code-critic` reviewer subagent once with the assembled file list and the plan path. Craft review (bloat, unnecessary abstractions, broad `try/except`, silent fallbacks, pattern drift, debug residue, scaffold tests) is primarily its lane — do a light pass yourself rather than duplicating it. For trivial changes where the critic is skipped, cover those craft checks yourself.
5. Fix only clear, high-impact issues reported by the subagent. Ignore low-confidence or out-of-scope feedback; re-run only after material changes.

### Boundaries

Do not:
- archive plans
- mutate `agent-work/features.yaml`
- create a commit
- perform broad documentation updates; note reflection candidates instead

### Output

Report one of:

- `READY FOR REFLECT` — implementation has passed review; include a `Summary:` line with 1-2 sentences on the review result before the handoff label, plus any documentation/reflection candidates
- `REVIEW ISSUES` — list the blocking issues and the concrete fixes needed
