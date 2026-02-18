---
name: commit
description: Review code, archive planning document, then commit files from session.
---

### Code Review (Non-Trivial Changes Only)

For changes involving multiple files or significant logic: invoke the **code-critic** subagent via Task tool to review modified files. Skip for trivial edits (typos, single-line fixes). Address valid concerns before continuing.

### Verify Clean State

Check modified files for:

- No debugging artifacts (console.logs, print statements, TODO markers for this feature)
- No AI slop: excess comments, defensive try/catch in trusted paths, unrequested default values, `any` casts to bypass types, etc.
- Code matches surrounding file conventions—if it looks out of place, fix it

### Archive Planning Document

If a markdown planning file exists for this work, archive it:

1. Run `~/.claude/skills/commit/scripts/archive_plan.sh <plan-file>` — this copies the plan to `docs/history/{yyyymmdd}_{basename}.md`
2. Rename the archive to include a descriptive suffix: `docs/history/yyyymmdd_{feature-id}_{short_desc}.md` (e.g., `20241201_auth-001_user_signup.md`). Keep `{short_desc}` to 2-4 words, snake_case. The feature ID enables visual epic grouping when scanning the directory.
3. Delete the original planning file from `docs/plans/`

Transform into permanent spec: remove implementation details, keep completed checklist as summary.

### Update features.yaml

Update features.yaml (if tracked feature):

Run `~/.claude/skills/commit/scripts/mark_done.sh <feature-id> <archive-path>` — this sets `status` to `"done"`, `completed_at` to today's date, and `spec_file` to the archive path.

Verify any discovered items are properly logged in features.yaml.

Include features.yaml in the commit.

### Release File Reservations

If `docs/plans/.file-locks.json` exists:

Run `~/.claude/skills/_lib/file_lock.sh release-all "" <feature-id>` — this removes all entries where `by` matches the current feature ID. If the lock file is now empty (`{}`), delete it.

Include the lock file change (or deletion) in the commit.

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

Finally verify if any updates are needed to the product documentation, mainly docs/STRUCTURE.md. Only document changes worth tracking that keep the document true to the codebase.

---
## Autopilot State Transition

If `.claude/workflow.json` exists (autopilot is active):

### Read mode
```bash
MODE=$(jq -r '.mode // "single"' .claude/workflow.json)
```

### Single mode
```bash
if [[ "$MODE" == "single" ]]; then
  FEATURE=$(jq -r '.feature' .claude/workflow.json)
  rm -f .claude/workflow.json
fi
```
Output:
```
AUTOPILOT COMPLETE: $FEATURE
Committed: <hash>
```

### Continuous mode
```bash
if [[ "$MODE" == "continuous" ]]; then
  EPIC=$(jq -r '.epic' .claude/workflow.json)

  # Find next ready feature in epic
  NEXT_FEATURE=$(~/.claude/skills/_lib/select_next_feature.sh --id features.yaml "$EPIC")

  if [[ -n "$NEXT_FEATURE" ]]; then
    # Loop back
    jq --arg f "$NEXT_FEATURE" '.feature = $f | .next = "/prime"' .claude/workflow.json > tmp.$$ && mv tmp.$$ .claude/workflow.json
  else
    # Epic complete
    rm -f .claude/workflow.json
  fi
fi
```

Output if looping:
```
AUTOPILOT CONTINUING: $NEXT_FEATURE
```

Output if complete:
```
AUTOPILOT COMPLETE: $EPIC epic
Committed: <hash>
```

On exception (git conflicts), abort autopilot (`rm -f .claude/workflow.json`) and report the issue to the user.
