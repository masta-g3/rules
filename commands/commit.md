---
description: Archive planning document first, then commit files from session.
---

Archive the planning document (if present):

If a markdown planning file exists for this work:

**Archive path:** `docs/history/yyyymmdd_{name}.md` (human-readable, chronological). Derive `{name}` from the feature description or plan file name.

Transform into permanent spec: remove implementation details, keep completed checklist as summary.

Verify clean state before committing:

- No debugging artifacts (console.logs, print statements, TODO markers for this feature)
- No AI slop: excess comments, defensive try/catch in trusted paths, `any` casts to bypass types
- Code matches surrounding file conventions—if it looks out of place, fix it

Update features.json (if tracked feature):

Use jq to update the feature entry:
1. Set `status` to `"done"`
2. Set `spec_file` to the archive path (this maps feature ID → human-readable spec)
3. Verify any discovered items are properly logged

Include features.json in the commit.

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

Finally verify if any updates are needed to the product documentation, mainly docs/STRUCTURE.md. Only document changes worth tracking that keep the document true to the codebase.

---
If `.claude/workflow.json` exists:
```bash
FEATURE=$(jq -r '.feature' .claude/workflow.json)
rm -f .claude/workflow.json
```
Output:
```
AUTOPILOT COMPLETE: $FEATURE
Committed: <hash>
```

On exception (git conflicts), clear workflow and report:
```
rm -f .claude/workflow.json
```
```
AUTOPILOT EXCEPTION: git_conflicts

Conflicting files:
- <file list>

To resume after resolving: /autopilot <feature-id>
```
