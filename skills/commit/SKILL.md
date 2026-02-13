---
name: commit
description: Review code, archive planning document, then commit.
---

Steps:
1. Verify clean reviewable state.
2. Archive active plan:
   - `skills/commit/scripts/archive_plan.sh <plan-file>`
3. For tracked feature, mark done:
   - `skills/commit/scripts/mark_done.sh <feature-id> <archive-path>`
4. Release file locks when present:
   - `skills/_lib/file_lock.sh release-all "" <feature-id>`
5. Commit touched files with concise message.
6. Advance autopilot state:
   - `skills/_lib/workflow_state.sh /next-feature`
