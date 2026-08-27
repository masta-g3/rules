---
name: review
description: Review finished work before reflection and commit.
metadata:
  thinkingLevel: medium
---

Review the active task after implementation and before `/reflect`. If the plan names a worktree, run the review inside it — that is where the changed files and `agent-work` artifacts live.

### Review Process

The step starts with `reviewing-implementation` as its default activity. Pi republishes it and increments its pass count when the exact `code-critic` tmux launch starts. For a non-tmux critic path only, call it manually as the fallback before each pass. Never use both paths for one pass.

Own correctness, plan fidelity, and scope. `code-critic` owns the implementation-craft and simplification pass; give it the changed files and plan rather than repeating its checks.

1. Identify the files and tests changed during implementation. Exclude commit-step artifacts (plan archival and `agent-work/features.yaml` completion updates), but include explicitly planned documentation deliverables.
2. Read the files and verify against the task: does the change solve it, did verification run and pass, and did scope stay within the plan? Ask whether a smaller change in the owning layer would solve the task. Flag plan overreach and edits that widen the impact surface.
3. Check session and `agent-work` hygiene per the AGENTS.md artifact retention rules.
4. Invoke the `code-critic` reviewer subagent with the assembled file list and the plan path. Craft review is its lane — do a light pass yourself rather than duplicating it.
5. Evaluate the findings and fix all clear, high-impact, in-scope issues before reporting. When available, call `set_workflow_activity` with `fixing-review-findings` before fixes; the later tmux critic launch restores `reviewing-implementation` automatically. Ignore nits, low-confidence findings, and suggestions that widen scope. After material fixes, rerun relevant verification and invoke `code-critic` again on the updated files. Continue until no actionable issues remain or progress requires user input. Do not stop merely to relay feedback that can be fixed within the current review step.

### Boundaries

Do not:
- archive plans
- mutate `agent-work/features.yaml`
- create a commit
- perform broad documentation updates; note reflection candidates instead

### Output

For successful review, call `set_workflow_activity` with `review-complete` when available, then include a `Summary:` line with 1-2 sentences or a bullet list covering the review result, fixes applied, and verification rerun. Include any documentation or reflection candidates before the handoff label.
- **READY FOR REFLECT** — no actionable review issues remain

Otherwise:
- **REVIEW ISSUES** — explain why remaining issues cannot be safely fixed within scope, list attempted fixes, and indicate the next action or required user input
