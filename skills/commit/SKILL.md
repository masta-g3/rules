---
name: commit
description: Commit files from session and archive/clean-up associated files.
---

Assume the work has already been reviewed and reflected. Quick final scan for debug artifacts, prompt residue, temporary tests/scripts, generated outputs, and stale `agent-work/` scratch files before proceeding. Keep only `agent-work/` artifacts that remain useful after commit, per the AGENTS.md retention rules.

Only start commit when authorized by the user. Reading this skill does not authorize work.

### Runtime integration

#### Pi

When the tools are available:
- Before starting, call `set_workflow_step` with `stepId: "commit"`. Changing the indicator does not authorize additional work.
- The initial activity is `archiving-plan`; do not duplicate that signal.
- Call `set_workflow_activity` with `committing-changes` before staging and committing.
- After meeting the completion requirements below, call `complete_workflow` once as the final action before the output. If a commit fails or closeout is blocked, leave Commit active.

#### Worktree tooling

For agent-managed worktree closeout, follow [the worktree helper reference](../_lib/worktrees.md). Worktrees supplied by a host such as Hub stay under that host's closeout; do not register or remove them with Rules.

### Archive Planning Document

If a planning file exists, archive it:

1. Run `$SKILLS_ROOT/commit/scripts/archive_plan.sh <plan-file> <short-desc>` — moves the plan to `agent-work/history/yyyymmdd_{feature-id}_{short_desc}.md` and removes the original. Use 2-4 word snake_case description (e.g., `user_signup`).
2. Compact the archived markdown into a concise durable summary. Keep it faithful to implemented work; do not add new scope.

### Update agent-work/features.yaml

If tracked feature: `$SKILLS_ROOT/_lib/features_yaml.sh complete <feature-id> --plan-file <archive-path>` — sets status to `"done"`, `completed_at` to today, and `plan_file` to archive path. Verify discovered items are logged. Commit `agent-work/` updates only where the repo tracks them. Never force-add ignored or local-only files.

### Documentation

Assume `/reflect` handled durable documentation updates. Do not make broad documentation changes here. If obvious documentation drift remains and the user skipped `/reflect`, stop and ask whether to run `/reflect` before committing.

### Commit

Commit only session work. Ask before unstaging unrelated changes.
Never stage a nested checkout.
Use an objective-focused subject; add 2–5 topic bullets only when useful.
No attribution signatures. Do not push unless specifically instructed.

### Multi-Repo Sessions

If this session touched multiple repositories, commit all session work independently per repo.

### Worktree Closeout

If the plan names a worktree, read and follow [Worktree Closeout](references/worktree-closeout.md).

### Completion requirements

Report completion only after every required repository commit succeeds and tracked feature and plan closeout is complete. For untracked work, confirm that no feature or plan closeout is required. An explicit pending-PR-merge handoff completes repository closeout for this turn; later merge cleanup is a separate user-invoked task.

If a commit fails, required changes remain uncommitted, or closeout is blocked, report the blocker instead of completion.

### Output

Include a `Summary:` line with 1-2 sentences on what was committed, then end with one of:

- `WORKFLOW COMPLETE` — no worktree, or the user confirmed the merge and the worktree is cleaned up; include the commit hash (and PR URL if any)
- `WORKFLOW COMPLETE — PENDING PR MERGE` — include the commit hash and PR URL. The user has not merged yet; the worktree stays in place. Once merged, they can ask for cleanup: remove the worktree and update the PR target branch.
