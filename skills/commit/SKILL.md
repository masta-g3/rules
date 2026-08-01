---
name: commit
description: Commit files from session and archive/clean-up associated files.
metadata:
  thinkingLevel: low
---

Assume the work has already been reviewed and reflected. Quick final scan for debug artifacts, prompt residue, temporary tests/scripts, generated outputs, and stale `agent-work/` scratch files before proceeding. Keep only `agent-work/` artifacts that remain useful after commit, per the AGENTS.md retention rules.

### Archive Planning Document

If a planning file exists, archive it:

1. Run `$SKILLS_ROOT/commit/scripts/archive_plan.sh <plan-file> <short-desc>` — moves the plan to `agent-work/history/yyyymmdd_{feature-id}_{short_desc}.md` and removes the original. Use 2-4 word snake_case description (e.g., `user_signup`).
2. Compact the archived markdown into a concise durable summary. Keep it faithful to implemented work; do not add new scope.

### Update agent-work/features.yaml

If tracked feature: `$SKILLS_ROOT/_lib/features_yaml.sh complete <feature-id> --plan-file <archive-path>` — sets status to `"done"`, `completed_at` to today, and `plan_file` to archive path. Verify discovered items are logged. Include `agent-work/features.yaml` in the commit.

### Documentation

Assume `/reflect` handled durable documentation updates. Do not make broad documentation changes here. If obvious documentation drift remains and the user skipped `/reflect`, stop and ask whether to run `/reflect` before committing.

### Commit

1. Inspect `git status --short`. If unrelated staged paths are present, ask the user whether to unstage them. If a worktree path appears as untracked, stop and add `agent-work/worktrees/` to `.gitignore` before staging — never commit a nested checkout. Then `git add` only session files.
2. `git commit -m` format:
   - First line: sentence describing the high-level objective.
   - 2-5 bullets grouping changes by topic (omit if single cohesive change).
   - No signatures (by Claude Code, coauthored with..., etc.).
3. Do not push unless specifically instructed.

Example: `Refactor API endpoints for better error handling.` with bullets like `- Standardize error response format.` / `- Add request validation middleware.`

### Multi-Repo Sessions

If this session touched multiple repositories, commit all session work independently per repo.

### Worktree Closeout

If the plan names a worktree, the commit above went to its branch. Close it out per repo:

1. Confirm the archived plan and the `agent-work/features.yaml` completion are part of that commit — the PR carries the ticket's full story, not just its code.
2. Before pushing, confirm the recorded PR target with the user; if absent, inspect and recommend the default branch. Push the branch and open the PR with `gh pr create --base <pr-target>`. Summarize the ticket and link the archived plan path. Report the PR URL; do not merge it.
3. Copy back anything worth keeping that the PR does not carry — `agent-work/tickets/<feature-id>/` evidence, decks, logs — into the top-level checkout, after the cleanup rules above have already pruned it.
4. Announce the commit and PR are ready (hash, PR URL), then use the ask-user tool to wait: ask whether the PR is merged and the local worktree should be deleted.
   - Confirmed: remove the worktree with `git worktree remove`, delete its now-empty parent under `agent-work/worktrees/`, update the PR target branch in the top-level checkout (`git pull` if it is checked out; otherwise `git fetch origin <pr-target>:<pr-target>`), then delete the local feature branch with `git branch -d <feature-id>` (never `-D` — if `-d` refuses, the branch has unmerged work; stop and report).
   - Not yet: leave the worktree in place and end with the pending-merge output below.

Removing the worktree does not touch the branch. If review asks for changes, `git worktree add agent-work/worktrees/<feature-id>/<repo-name> <feature-id>` restores it.

### Output

Include a `Summary:` line with 1-2 sentences on what was committed, then end with one of:

- `WORKFLOW COMPLETE` — no worktree, or the user confirmed the merge and the worktree is cleaned up; include the commit hash (and PR URL if any)
- `WORKFLOW COMPLETE — PENDING PR MERGE` — include the commit hash and PR URL. The user has not merged yet; the worktree stays in place. Once merged, they can ask for cleanup: remove the worktree and update the PR target branch.
