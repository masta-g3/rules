## Experimental File Reservations (Parallel Mode)

This document is a standalone prompt/reference for the experimental parallel file-lock flow.

It is **not** part of the default workflow and is **not** included in `AGENTS.md`.
Use it only when explicitly running a prompt that enables file reservations.

If `docs/plans/.file-locks.json` does not exist, skip this section unless the invoked command includes `--parallel`; in that case, create the file during the planning phase.

Derive `FEATURE_ID` from the active plan file name (e.g., `auth-001.md` → `auth-001`).

Lock file schema:

```json
{"src/auth/login.py": {"by": "auth-001", "at": "2026-01-30T10:30:00Z"}}
```

### Planning Phase

When the invoked command includes `--parallel`:
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

Run `$SKILLS_ROOT/_lib/file_lock.sh release-all "" "$FEATURE_ID"` — this removes all entries where `by` matches the current feature ID. If the lock file is now empty (`{}`), delete it.

Include the lock file change (or deletion) in the commit.
