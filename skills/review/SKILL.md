---
name: review
description: Review finished work before reflection and commit.
---

Review the active task after implementation and before `/reflect`. If the plan names a worktree, run the review inside it — that is where the changed files and `agent-work` artifacts live.

Only start review when authorized by the user. Reading this skill does not authorize work.

### Runtime integration

#### Pi

When the tools are available:
- Before starting, call `set_workflow_step` with `stepId: "review"`. Changing the indicator does not authorize additional work.
- The initial activity is `reviewing-implementation`. Launch `code-critic` through `tmux_subagent`; Pi republishes that activity and increments the pass count. Only for a non-tmux launch, publish `reviewing-implementation` manually before each pass. Never do both.
- Call `set_workflow_activity` with `fixing-review-findings` before fixes and `review-complete` before the successful report.

### Review Process

Own correctness, plan fidelity, and scope. `code-critic` owns the implementation-craft and simplification pass; give it the changed files and plan rather than repeating its checks.

1. Identify the files and tests changed during implementation. Exclude commit-step artifacts (plan archival and `agent-work/features.yaml` completion updates), but include explicitly planned documentation deliverables.
2. Read the files and verify against the task: does the change solve it, did verification run and pass, and did scope stay within the plan? Ask whether a smaller change in the owning layer would solve the task. Flag plan overreach and edits that widen the impact surface.
   If the implementation adds useful but unplanned behavior, infrastructure, policy, state, dependency, or user-facing behavior, remove it from the current change. Report what was removed. Ask the user only if removal would break the requested outcome, an existing contract, data safety, or the commit boundary.
3. Check session and `agent-work` hygiene per the AGENTS.md artifact retention rules.
4. Invoke the `code-critic` reviewer subagent with the assembled file list and the plan path. Craft review is its lane — do a light pass yourself rather than duplicating it.
5. Evaluate the findings and fix all clear, high-impact, in-scope issues before reporting. Ignore nits and low-confidence findings. Do not implement suggestions that widen scope. After material fixes, rerun relevant verification and invoke `code-critic` again on the updated files. Continue until no actionable issues remain or progress requires user input. Do not stop merely to relay feedback that can be fixed within the current review step.

### Boundaries

Do not:
- archive plans
- mutate `agent-work/features.yaml`
- create a commit
- perform broad documentation updates; note reflection candidates instead

Do not act on out-of-scope suggestions. If a finding identifies a clear, high-impact problem, record it under `Reflection Candidates` in the active plan for later triage. Ignore nits and speculative improvements.

### Output

For successful review, include a `Summary:` list with 2–5 bullets grouping the material corrections and simplifications. Note code, tests, fallbacks, or duplicate paths removed and LOC reduced when meaningful. End with the verification rerun and result. Omit change details when no changes were needed. Include any documentation or reflection candidates before the handoff label.
- **READY FOR REFLECT** — no actionable review issues remain

Otherwise:
- **REVIEW ISSUES** — explain why remaining issues cannot be safely fixed within scope, list attempted fixes, and indicate the next action or required user input
