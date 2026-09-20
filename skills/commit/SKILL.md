---
name: commit
description: Commit files from session and archive/clean-up associated files.
---

Assume the work has already been reviewed and reflected. Quick final scan for debug artifacts, prompt residue, temporary tests/scripts, generated outputs, and stale `agent-work/` scratch files before proceeding. Keep only `agent-work/` artifacts that remain useful after commit, per the AGENTS.md retention rules.

When available, call `set_workflow_step` with `stepId: "commit"` before starting this authorized step. Reading this skill alone does not update the indicator. Changing steps does not authorize additional work.

### Archive Planning Document

The step starts with `archiving-plan`. Rely on that default during archive work; do not make a redundant activity call.

If a planning file exists, archive it:

1. Run `$SKILLS_ROOT/commit/scripts/archive_plan.sh <plan-file> <short-desc>` — moves the plan to `agent-work/history/yyyymmdd_{feature-id}_{short_desc}.md` and removes the original. Use 2-4 word snake_case description (e.g., `user_signup`).
2. Compact the archived markdown into a concise durable summary. Keep it faithful to implemented work; do not add new scope.

### Update agent-work/features.yaml

If tracked feature: `$SKILLS_ROOT/_lib/features_yaml.sh complete <feature-id> --plan-file <archive-path>` — sets status to `"done"`, `completed_at` to today, and `plan_file` to archive path. Verify discovered items are logged. Commit `agent-work/` updates only where the repo tracks them. Never force-add ignored or local-only files.

### Documentation

Assume `/reflect` handled durable documentation updates. Do not make broad documentation changes here. If obvious documentation drift remains and the user skipped `/reflect`, stop and ask whether to run `/reflect` before committing.

### Commit

When `set_workflow_activity` is available, call it with `committing-changes` before staging and committing.

1. Inspect `git status --short`. If unrelated staged paths are present, ask the user whether to unstage them. If an explicitly adopted nested checkout appears as untracked, stop and ensure it cannot be staged; never commit a nested checkout. External Rules worktrees need no source-repository ignore rule. Then `git add` only session files.
2. `git commit -m` format:
   - First line: sentence describing the high-level objective.
   - 2-5 bullets grouping changes by topic (omit if single cohesive change).
   - No signatures (by Claude Code, coauthored with..., etc.).
3. Do not push unless specifically instructed.

Example: `Refactor API endpoints for better error handling.` with bullets like `- Standardize error response format.` / `- Add request validation middleware.`

### Multi-Repo Sessions

If this session touched multiple repositories, commit all session work independently per repo.

### Worktree Closeout

If the plan names a worktree, the commit above went to its branch. Hub-owned worktrees stay under Hub closeout; do not register or remove them with Rules. For a Rules-owned record:

1. Confirm tracked plan and ticket updates are committed. Run `$SKILLS_ROOT/_lib/worktrees.sh state --record <record> --state awaiting-merge --reason <bounded-reason>` before the merge handoff.
2. Confirm the recorded PR target. Push and open the PR with `gh pr create --base <target>` and the `write-pr` skill. Do not infer or perform the merge.
3. Inventory useful local untracked or ignored artifacts. Copy back only approved useful artifacts without overwriting unrelated files. Record a bounded disposition for every local artifact: `dispose`, or `preserve` with its verified absolute destination. Build outputs and dependencies are not automatically useful.
4. Ask whether integration is complete and cleanup is approved. If not, retain the worktree and record `awaiting-merge` or `cleanup-pending` independently of workflow completion.
5. After confirmed integration, first update the surviving source checkout's ticket `plan_file` and verify the canonical archived plan exists there. Then call `$SKILLS_ROOT/_lib/worktrees.sh remove --record <record> --outcome merged --artifact-dispositions '<json>' --authored-root <source> --plan-file <archive-relative-path>`. Use `discarded` only for an explicitly approved discard. The helper uses ordinary verified removal. It never forces removal, copies artifacts, scans for worktrees, or deletes a branch.
6. If removal or safe `git branch -d` refuses, retain `cleanup-pending`/`check-needed` and report it. Never use `--force`, `rm -rf`, stash, or `branch -D`. The durable external record remains after cleanup and its authored root points to the surviving source.

### Complete Workflow Indicator

When the current harness provides the Pi-only `complete_workflow` tool, call it once as the final action before the output, but only after every required repository commit succeeds and tracked feature and plan closeout is complete. For untracked work, first confirm that no feature or plan closeout is required. A worktree with an explicit pending-PR-merge handoff has completed repository closeout for this commit turn; later merge cleanup is a separate user-invoked task. In other harnesses, skip only this indicator step.

Do not call `complete_workflow` if a commit failed, required feature or plan changes are not committed, or the turn is blocked before closeout. Failed or blocked commit turns must keep Commit active.

### Output

Include a `Summary:` line with 1-2 sentences on what was committed, then end with one of:

- `WORKFLOW COMPLETE` — no worktree, or the user confirmed the merge and the worktree is cleaned up; include the commit hash (and PR URL if any)
- `WORKFLOW COMPLETE — PENDING PR MERGE` — include the commit hash and PR URL. The user has not merged yet; the worktree stays in place. Once merged, they can ask for cleanup: remove the worktree and update the PR target branch.
