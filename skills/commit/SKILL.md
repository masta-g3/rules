---
name: commit
description: Archive planning document, finalize tracked work, and commit files from session.
---

Assume `SKILLS_ROOT` is set per `AGENTS.md` before running helper commands.

Assume the work has already been reviewed.

### Verify Commit Scope

Make sure the commit only includes the intended session files. There may already be unrelated staged changes in the repo; if so, ask the user whether to unstage them before continuing.

### Final Hygiene

Do a brief final pass on the files you are about to commit:

- no debugging artifacts or TODO/FIXME markers tied to completed work
- no obviously out-of-place prompt residue
- no half-finished edits or broken files

### Archive Planning Document

If a markdown planning file exists for this work, archive it:

1. Run `$SKILLS_ROOT/commit/scripts/archive_plan.sh <plan-file> <short-desc>` — this moves the plan into `docs/history/` using the final dated descriptive filename, removes the original from `docs/plans/`, and returns the final archive path.
2. Use a short snake_case description with 2-4 words, for example `user_signup`, so the final path looks like `docs/history/yyyymmdd_{feature-id}_{short_desc}.md`.
3. Compact the archived markdown into a concise durable summary. Keep it faithful to the implemented work and completed checklist; do not add new scope.

### Update features.yaml

Update features.yaml (if tracked feature):

Run `$SKILLS_ROOT/_lib/features_yaml.sh complete <feature-id> --plan-file <archive-path>` — this sets `status` to `"done"`, `completed_at` to today's date, and `plan_file` to the archive path.

Verify any discovered items are properly logged in features.yaml.

Include features.yaml in the commit.

### Repo Docs

Before staging, update any repo documentation needed to reflect the finished work, mainly `docs/STRUCTURE.md`, `README.md`, and nearby guides. Keep these edits concise and factual.

### Commit

Commit all files modified during this session:

1. Inspect `git status --short`. If unrelated staged paths are present, ask the user whether to unstage them. Then `git add` only the files worked on in this session.
2. `git commit -m` with message format:
   - First line: sentence describing the high-level objective.
   - 2-5 bullets grouping changes by topic (omit if single cohesive change).
   Do not add additional messages or signatures (by Claude Code, coauthored with..., etc.).
3. Do not push; leave the branch local unless specifically instructed.

Examples:

Single-line commit:
```
Implement user authentication flow with JWT tokens.
```

Multi-line commit:
```
Refactor API endpoints for better error handling.

- Standardize error response format across all routes.
- Add request validation middleware.
- Implement proper HTTP status codes.
```

### Multi-Repo Sessions

If this session touched files across multiple repositories or directories, ask the user whether to commit in those other repos as well. If yes, follow the same principles above for each repo independently (separate `git add`, appropriate commit message per repo, no cross-repo bundling).
