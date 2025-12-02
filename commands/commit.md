---
description: Archive planning document first, then commit files from session.
---

Archive the planning document (if present):

If a markdown planning file exists for this work:

**Determine archive path from plan file name:**
- If plan file matches `{epic}-{nnn}.md` → archive to `docs/history/{id}.md`
- Otherwise → archive to `docs/history/yyyymmdd_{name}.md`

Transform into permanent spec: remove implementation details, keep completed checklist as summary.

Verify clean state before committing:

- No debugging artifacts (console.logs, print statements, TODO markers for this feature)
- No AI slop: excess comments, defensive try/catch in trusted paths, `any` casts to bypass types
- Code matches surrounding file conventions—if it looks out of place, fix it

Update features.json (if exists and tracked feature):

If plan file was `{epic}-{nnn}.md`, use jq to:
1. Set `status` to `"done"`
2. Set `spec_file` to the archive path
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
