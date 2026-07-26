---
name: review
description: Review finished work before reflection and commit.
metadata:
  thinkingLevel: high
---

Review the active task after implementation and before `/reflect`. If the plan names a worktree, run the review inside it — that is where the changed files and `agent-work` artifacts live.

### Review Process

Verify correctness, minimal surface area, and reuse of existing patterns. Flag scope creep, unnecessary abstractions or one-use wrappers/classes, broad exception handling or silent fallbacks, unrequested compatibility layers, and other AI bloat.

1. Identify the files changed during implementation. Exclude commit-step artifacts (plan archival and `agent-work/features.yaml` completion updates), but include explicitly planned documentation deliverables.
2. Read them and verify against the task: does the change solve it, did the plan's verification steps actually run and pass, and did scope stay within the plan? Ask whether the same task could have been solved with a simpler, smaller change — flag scope creep, plan overreach, or edits that widen the impact surface. Check the plan's `## Reuse` section: were the listed components actually used, and does any new abstraction, library, or pattern have the justification the plan required?
3. Check session and `agent-work` hygiene per the AGENTS.md artifact retention rules.
4. Invoke the `code-critic` reviewer subagent with the assembled file list and the plan path. Craft review is its lane — do a light pass yourself rather than duplicating it.
5. Evaluate the findings and fix all clear, high-impact, in-scope issues before reporting. Ignore nits, low-confidence findings, and suggestions that widen scope. After material fixes, rerun relevant verification and invoke `code-critic` again on the updated files. Continue until no actionable issues remain or progress requires user input. Do not stop merely to relay feedback that can be fixed within the current review step.

### Boundaries

Do not:
- archive plans
- mutate `agent-work/features.yaml`
- create a commit
- perform broad documentation updates; note reflection candidates instead

### Output

For successful review, include a `Summary:` line with 1-2 sentences or a bullet list covering the review result, fixes applied, and verification rerun. Include any documentation or reflection candidates before the handoff label.
- **READY FOR REFLECT** — no actionable review issues remain

Otherwise:
- **REVIEW ISSUES** — explain why remaining issues cannot be safely fixed within scope, list attempted fixes, and indicate the next action or required user input
