# Parallel tickets with isolated worktrees

Extension of `workflow-orchestrator`. Use only when the user explicitly asks to run independent tickets in parallel. Everything in `SKILL.md` still applies; this file adds the worktree mechanics.

Never run two writable ticket agents in the same checkout. Parallel execution requires one git worktree, one branch, and one persistent child per ticket.

## Procedure

1. Choose tickets that are currently actionable and do not depend on each other. Do not pull blocked or dependent tickets forward just to hit a requested concurrency count.
2. If fewer independent tickets are ready than the requested parallel count, either run the smaller ticket set or use the spare slot for a read-only advisory/design/research subagent whose output is fed into relevant ticket phases.
3. Verify the main worktree is safe. Known ignored/untracked local artifacts are acceptable; unrelated tracked changes are a stop condition unless the user approves them.
4. Create isolated worktrees from the same base commit:
   ```text
   git worktree add -b agent/<ticket-id> <repo>.worktrees/<ticket-id> HEAD
   ```
5. Launch one persistent child per worktree with `cwd` set to that worktree and `autoStopOnComplete: false`. Enable nested specialists only with a narrow allowlist appropriate for the ticket/phase.
6. Include a worktree boundary in every child prompt:
   - work only in `<repo>.worktrees/<ticket-id>` on branch `agent/<ticket-id>`;
   - do not touch the main checkout or sibling worktrees;
   - commit locally on the ticket branch only;
   - do not push, merge, or clean up worktrees.
7. Advance each child through the normal phase gates independently. Parallelize waits/sends when possible, but inspect each completed phase before advancing that ticket.
8. If advisory/design output is required, launch it read-only from the parent and pass its result path into the affected ticket execute/review prompts.
9. After all selected tickets reach `WORKFLOW COMPLETE`, stop the children.
10. Merge back sequentially under parent control:
    - fast-forward or merge the first completed branch into main;
    - rebase each remaining ticket branch onto updated main in its own worktree;
    - if rebase/merge conflicts are mechanical and within scope, resolve and validate; otherwise stop for the user;
    - merge each rebased branch into main;
    - run full validation from main.
11. Remove worktrees and delete merged ticket branches only after main validation passes.

Expected conflicts are usually in `agent-work/features.yaml`, shared docs, tests, exports, and content indexes. Worktree isolation prevents runtime races, but the parent still owns merge order and conflict resolution.

## Additions to the phase prompt contract

- the exact worktree path and branch name;
- instruction not to touch the main checkout or sibling worktrees.

## Additional parent inspection gate

- the commit landed only on the child ticket branch and was not pushed or merged by the child.

## Additional child lifecycle rule

- Bind each child to its worktree with the `cwd` launch parameter and repeat the worktree boundary in every follow-up prompt.

## Additional final output

- worktree paths and branch names used;
- per-ticket child/job IDs if useful for inspection;
- per-branch commit hashes before merge and final main commit hashes after merge/rebase;
- merge/rebase conflicts, resolutions, and final validation;
- whether worktrees/branches were cleaned up.
