# Parallel tickets with isolated worktrees

Extension of `workflow-orchestrator`. Use only when the user explicitly asks to run independent tickets in parallel. Everything in `SKILL.md` still applies; this file adds the worktree mechanics.

Never run two writable ticket agents in the same checkout. Parallel execution requires one git worktree, one branch, and one persistent child per ticket.

## Procedure

1. Choose tickets that are currently actionable and do not depend on each other. Do not pull blocked or dependent tickets forward just to hit a requested concurrency count.
2. If fewer independent tickets are ready than the requested parallel count, either run the smaller ticket set or use the spare slot for a read-only advisory/design/research subagent whose output is fed into relevant ticket phases.
3. Verify the main worktree is safe. Known ignored/untracked local artifacts are acceptable; unrelated tracked changes are a stop condition unless the user approves them.
4. Confirm the shared start branch and PR target with the user. An explicit request for parallel execution approves worktree isolation but does not select these branches.
5. Ensure `agent-work/worktrees/` is ignored, then create canonical isolated worktrees:
   ```text
   git worktree add \
     agent-work/worktrees/<ticket-id>/<repo-name> \
     -b <ticket-id> \
     <start-branch>
   ```
6. Copy required untracked local configuration, such as `.env*`, into each worktree.
7. Launch one persistent child per worktree with `cwd` set to that worktree and `autoStopOnComplete: false`. Enable nested specialists only with a narrow allowlist appropriate for the ticket/phase.
8. Include a worktree boundary in every child prompt:
   - work only in `agent-work/worktrees/<ticket-id>/<repo-name>` on branch `<ticket-id>`;
   - do not touch the main checkout or sibling worktrees;
   - commit and push only the ticket branch;
   - do not merge or clean up worktrees.
9. Advance each child through the normal phase gates independently. Parallelize waits/sends when possible, but inspect each completed phase before advancing that ticket.
10. Relay unresolved `plan-md` interview questions to the user and return each answer to the same child.
11. If advisory/design output is required, launch it read-only from the parent and pass its result path into the affected ticket execute/review prompts.
12. Let each ticket's `commit` phase push its branch and open its PR against the confirmed target.
13. Accept `WORKFLOW COMPLETE — PENDING PR MERGE` while the PR remains open. Stop the child and retain its worktree.
14. After the user confirms a PR was merged:
    - remove that ticket's worktree;
    - update the PR target branch in the top-level checkout;
    - delete the local ticket branch with `git branch -d <ticket-id>`.
15. Run full validation from the updated target branch after all selected PRs are merged.

Expected PR conflicts are usually in `agent-work/features.yaml`, shared docs, tests, exports, and content indexes. Worktree isolation prevents runtime races, but the hosting service and user own merge order. Do not rebase, merge, or resolve cross-ticket conflicts without explicit user approval.

## Additions to the phase prompt contract

- the exact worktree path and branch name;
- instruction not to touch the main checkout or sibling worktrees.

## Additional parent inspection gate

- the commit and PR contain only the ticket branch's expected changes and target the approved branch.

## Additional child lifecycle rule

- Bind each child to its worktree with the `cwd` launch parameter and repeat the worktree boundary in every follow-up prompt.

## Additional final output

- worktree paths and branch names used;
- per-ticket child/job IDs if useful for inspection;
- per-ticket commit hashes and PR URLs;
- pending merge or conflict state and final target-branch validation;
- whether worktrees/branches were cleaned up.
