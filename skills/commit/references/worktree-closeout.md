# Worktree Closeout

If the plan names a worktree, commit there and confirm all required plan and ticket updates are committed. Respect external ownership; do not take over cleanup.

Confirm the PR target before an authorized push or PR. Do not infer or perform the merge. Remove a worktree only after the user confirms integration and approves cleanup, or explicitly approves discarding the work. Preserve approved local artifacts without overwriting unrelated files, and verify that the canonical ticket and archived plan survive cleanup.

If approval is pending or cleanup fails, retain the worktree and report the blocker. Never force removal or hide changes to bypass safety checks. Workflow completion, merge outcome, and verified cleanup are separate states.
