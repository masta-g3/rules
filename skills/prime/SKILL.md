---
name: prime
description: Context prime the model by reading files relevant to a task.
argument-hint: "[task]"
---

Read and understand the codebase for task `$1`.

Steps:
1. Read `docs/STRUCTURE.md` and relevant docs/files tied to `$1`.
2. Run `git log --oneline -10` for recent context.
3. Summarize conventions and constraints before implementation.
4. Advance workflow state for autopilot users:
   - `skills/_lib/workflow_state.sh /plan-md`
