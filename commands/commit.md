---
description: Archive planning document first, then commit files from session.
---

Archive the planning document first (if present):

Before committing, if a markdown planning file exists for this feature (e.g., FEATURE.md or similar), transform it into a permanent feature spec under docs/history/yyyymmdd_feature_spec.md. Reformat as lightweight documentation: remove implementation details, bloated content, and keep the completed checklist at the end as a summary. Verify the date via terminal.

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
