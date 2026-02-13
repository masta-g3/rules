---
name: execute
description: Implement the approved plan.
---

Execute from active plan in phases.

Required behavior:
1. Run one baseline smoke check before edits.
2. Implement incrementally and verify outcomes per phase.
3. Apply file lock protocol when `docs/plans/.file-locks.json` exists using `skills/_lib/file_lock.sh`.
4. Track discovered work in plan and `features.yaml` when needed.
5. Report either:
   - `PLAN COMPLETE`
   - `PENDING STEPS`
6. Advance autopilot state:
   - `skills/_lib/workflow_state.sh /commit`
