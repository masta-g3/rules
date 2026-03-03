## File Reservations (Parallel Mode)

If `docs/plans/.file-locks.json` does not exist, skip this section entirely.

Derive feature ID from the active plan file name (e.g., `auth-001.md` → `auth-001`).

### Planning Phase

When `$1` contains `--parallel`:
1. If `docs/plans/.file-locks.json` doesn't exist, create it with `{}`
2. After creating the plan, check the lock file against files in the Context Files section
3. Report any conflicts: "⚠ {file} is reserved by {feature-id}"
4. Informational only — no reservations placed during planning

### Execution Phase

Apply the reservation protocol using `$SKILLS_ROOT/_lib/file_lock.sh` before each file modification:

1. Check if file is locked by another feature
2. If locked: sleep 15s, retry (up to 5 attempts). If still locked, report to user and pause
3. Reserve the file → modify it → release the reservation

One file at a time. Do not batch-reserve.

### Commit Phase

Run `$SKILLS_ROOT/_lib/file_lock.sh release-all "" <feature-id>` — this removes all entries where `by` matches the current feature ID. If the lock file is now empty (`{}`), delete it.

Include the lock file change (or deletion) in the commit.
