---
name: commit
description: Review code, archive planning document, then commit files from session.
---

Set `$SKILLS_ROOT` to your harness skills path before helper commands: `~/.codex/skills` (Codex), `~/.claude/skills` (Claude), `~/.cursor/skills` (Cursor), `~/.pi/agent/skills` (Pi).

### Code Review (Non-Trivial Changes Only)

For changes involving multiple files or significant logic, invoke the **code-critic** reviewer subagent to review modified files. Skip for trivial edits (typos, single-line fixes). Address valid concerns before continuing.

### Verify Clean State

Check modified files for:

- No debugging artifacts (console.logs, print statements, TODO markers for this feature).
- No AI slop: excess comments, defensive try/catch in trusted paths, unrequested default values, `any` casts to bypass types, etc.
- Code matches surrounding file conventions—if it looks out of place, fix it.

### Archive Planning Document

If a markdown planning file exists for this work, archive it:

1. Run `$SKILLS_ROOT/commit/scripts/archive_plan.sh <plan-file> <short-desc>` — this moves the plan into `docs/history/` using the final dated descriptive filename, removes the original from `docs/plans/`, and returns the final archive path.
2. Use a short snake_case description with 2-4 words, for example `user_signup`, so the final path looks like `docs/history/yyyymmdd_{feature-id}_{short_desc}.md`.
3. Compact the archived markdown into its durable summary/spec form: remove implementation-heavy detail, keep the completed outcome and checklist summary.

### Update features.yaml

Update features.yaml (if tracked feature):

Run `$SKILLS_ROOT/_lib/features_yaml.sh complete <feature-id> --plan-file <archive-path>` — this sets `status` to `"done"`, `completed_at` to today's date, and `plan_file` to the archive path.

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
