---
name: commit
description: Archive planning document, finalize tracked work, and commit files from session.
---

Assume `SKILLS_ROOT` is set per `AGENTS.md` before running helper commands.

Assume the work has already been reviewed. Quick final scan for debug artifacts or prompt residue before proceeding.

### Archive Planning Document

If a planning file exists, archive it:

1. Run `$SKILLS_ROOT/commit/scripts/archive_plan.sh <plan-file> <short-desc>` — moves the plan to `docs/history/yyyymmdd_{feature-id}_{short_desc}.md` and removes the original. Use 2-4 word snake_case description (e.g., `user_signup`).
2. Compact the archived markdown into a concise durable summary. Keep it faithful to implemented work; do not add new scope.

### Update features.yaml

If tracked feature: `$SKILLS_ROOT/_lib/features_yaml.sh complete <feature-id> --plan-file <archive-path>` — sets status to `"done"`, `completed_at` to today, and `plan_file` to archive path. Verify discovered items are logged. Include `features.yaml` in the commit.

### Repo Docs

Update `docs/STRUCTURE.md`, `README.md`, and related `docs/` guides to reflect finished work. Keep edits concise and factual.

### Commit

1. Inspect `git status --short`. If unrelated staged paths are present, ask the user whether to unstage them. Then `git add` only session files.
2. `git commit -m` format:
   - First line: sentence describing the high-level objective.
   - 2-5 bullets grouping changes by topic (omit if single cohesive change).
   - No signatures (by Claude Code, coauthored with..., etc.).
3. Do not push unless specifically instructed.

Example: `Refactor API endpoints for better error handling.` with bullets like `- Standardize error response format.` / `- Add request validation middleware.`

### Multi-Repo Sessions

If this session touched multiple repositories, ask the user whether to commit in each. If yes, commit independently per repo.
