# Worktree helper

Read this reference only when creating, registering, validating, or closing an agent-managed worktree. The helper is shared across harnesses; it requires Git, `uv`, and Unix file locking.

## Ownership and records

- Use one owner. Reuse an externally supplied mapping, such as Hub's, without creating or registering a Rules record. The helper does not discover external ownership; the caller must establish it. `--hub-owned` explicitly refuses creation or registration.
- Rules records live outside the source checkout under `AGENT_WORKTREES_DIR`, defaulting to `~/.local/share/agent-worktrees`. `--root` overrides that directory with an absolute path.
- Keep the exact returned `recordPath`. Read the plan and ticket from the record's `authoredRoot`. Never infer a record path, scan for an existing mapping, or create duplicate records.
- If using an approved nested checkout, verify that Git cannot stage it. Do not add blanket ignore rules for external worktrees.
- Copy only necessary untracked local configuration after inspecting it. Never include its contents in plans or logs.

## Create or register

Use one JSON `--repo` argument per repository. All paths must be absolute.

| Field | Meaning |
| --- | --- |
| `source` | Original repository root |
| `label` | Unique short repository name |
| `branch` | Working branch |
| `base` | Starting branch or commit, required for creation |
| `target` | Branch intended to receive the changes |
| `worktree` | Existing checkout path, required for registration |
| `role` | `primary` for the repository holding the canonical plan and ticket; `additional` for others |

Exactly one repository must have role `primary`. Confirm the base and target with the user before creating a worktree. Replace the example values below with approved values.

```bash
"$SKILLS_ROOT/_lib/worktrees.sh" create --ticket example-001 \
  --repo '{"source":"/absolute/project","label":"app","branch":"example-001","base":"main","target":"main","role":"primary"}'

"$SKILLS_ROOT/_lib/worktrees.sh" register --ticket example-001 \
  --repo '{"source":"/absolute/project","worktree":"/absolute/existing-worktree","label":"app","branch":"example-001","target":"main","role":"primary"}'
```

Creation makes a unique task directory containing `worktree.json` and the worktrees. Registration preserves and validates an existing approved location, including an explicitly approved nested checkout. Neither operation authorizes taking over an externally owned worktree.

## Validate before use

```bash
"$SKILLS_ROOT/_lib/worktrees.sh" inspect --record /absolute/worktree.json
```

Read the reported repository statuses, not just the exit code. Active worktrees must report `valid`; `missing`, `mismatched`, `query-failed`, or an already `cleaned` worktree cannot be used for execution. Stop and report a missing or invalid record or mapping. Do not recreate it or fall back to another checkout.

Inspection does not update record state. The `state` command accepts only `awaiting-merge` and `cleanup-pending`; do not attempt to set `check-needed` manually. Failure states are written by the operations that own them.

## Closeout

This helper's cleanup requires a surviving ticket in `agent-work/features.yaml` and its archived plan. If these do not exist, report the blocker rather than inventing a ticket or bypassing cleanup checks.

1. Confirm tracked plan and ticket updates are committed. Before the merge handoff, run:

   ```bash
   "$SKILLS_ROOT/_lib/worktrees.sh" state --record /absolute/worktree.json \
     --state awaiting-merge --reason 'Awaiting approved integration'
   ```

2. Confirm the recorded PR target. Follow the commit skill's push authorization, use `write-pr`, and create the PR with `gh pr create --base <target>`. Do not infer or perform the merge.
3. Inventory local untracked and ignored artifacts. Copy only approved useful artifacts to verified destinations outside the worktree without overwriting unrelated files. Build outputs and dependencies are not automatically useful. Give every artifact root a disposition, for example:

   ```json
   [{"repository":"app","path":"build/","action":"dispose"},
    {"repository":"app","path":"notes.txt","action":"preserve","destination":"/absolute/saved/notes.txt"}]
   ```

4. Ask whether integration is complete and cleanup is approved. Until then, retain the worktree and record `awaiting-merge` or `cleanup-pending`. Workflow completion, merge outcome, and cleanup are independent states. The helper trusts the declared merge outcome; it does not verify integration into the target.
5. After confirmation, update the surviving source checkout's ticket `plan_file` and verify its canonical archived plan exists. Then run:

   ```bash
   "$SKILLS_ROOT/_lib/worktrees.sh" remove --record /absolute/worktree.json \
     --outcome merged --artifact-dispositions '<json>' \
     --authored-root /absolute/project --plan-file agent-work/history/<archived-plan>.md
   ```

   Use `discarded` only for an explicitly approved discard. The helper verifies artifact dispositions, deletes only those approved local artifacts, and uses ordinary Git worktree removal. It does not copy artifacts, force removal, scan for worktrees, or delete branches.
6. If removal or safe `git branch -d` refuses, retain the worktree and report the blocker. Do not force removal, stash changes to bypass checks, use `rm -rf`, or use `branch -D`. After successful cleanup, the durable record remains and its `authoredRoot` points to the surviving source checkout.
