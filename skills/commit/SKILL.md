---
name: commit
description: Review code, archive planning document, then commit files from session.
---

Set `$SKILLS_ROOT` to your harness skills path before helper commands: `~/.codex/skills` (Codex), `~/.claude/skills` (Claude), `~/.cursor/skills` (Cursor).

### Code Review (Non-Trivial Changes Only)

For changes involving multiple files or significant logic: invoke the **code-critic** subagent via Task tool to review modified files. Skip for trivial edits (typos, single-line fixes). Address valid concerns before continuing.

### Verify Clean State

Check modified files for:

- No debugging artifacts (console.logs, print statements, TODO markers for this feature).
- No AI slop: excess comments, defensive try/catch in trusted paths, unrequested default values, `any` casts to bypass types, etc.
- Code matches surrounding file conventions—if it looks out of place, fix it.

### Archive Planning Document

If a markdown planning file exists for this work, archive it:

1. Run `$SKILLS_ROOT/commit/scripts/archive_plan.sh <plan-file>` — this copies the plan to `docs/history/{yyyymmdd}_{basename}.md`
2. Rename the archive to include a descriptive suffix: `docs/history/yyyymmdd_{feature-id}_{short_desc}.md` (e.g., `20241201_auth-001_user_signup.md`). Keep `{short_desc}` to 2-4 words, snake_case. The feature ID enables visual epic grouping when scanning the directory.
3. Delete the original planning file from `docs/plans/`

Transform into permanent spec: remove implementation details, keep completed checklist as summary.

### Update features.yaml

Update features.yaml (if tracked feature):

Run `$SKILLS_ROOT/commit/scripts/mark_done.sh <feature-id> <archive-path>` — this sets `status` to `"done"`, `completed_at` to today's date, and `spec_file` to the archive path.

Verify any discovered items are properly logged in features.yaml.

Include features.yaml in the commit.

### Commit

Commit all files modified during this session:

1. `git add` files worked on. There might be other unrelated staged files in the repo; do not include them in your commit.
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

Finally verify if any updates are needed to the product documentation, mainly docs/STRUCTURE.md. Only document changes worth tracking that keep the document true to the codebase.
