---
description: Select the next feature to implement from features.json and prepare for the atomic cycle.
model: claude-haiku-4-5
disable-model-invocation: true
---

### 1. Review State

- Read `docs/STRUCTURE.md` (if present) for project context
- Use jq to extract feature status summary from `features.json`
- Run `git log --oneline -10` to understand recent work

### 2. Select Feature

Identify **ready** features—those where:
- `status` is `"pending"`
- All IDs in `depends_on` have `status: "done"`

From ready features:
1. Prefer highest priority (1 before 2 before 3)
2. If tied, prefer earlier `created_at`, then earlier ID

If no features are ready:
- Check for circular dependencies (report to user, don't auto-resolve)
- Check for blocked prerequisites
- Report situation to user; do not guess

Report selection briefly and to the point, without much extra comment:

```
NEXT FEATURE: [id]
Description: [description]
Priority: [priority]
Dependencies: [list or "none"]
Suggested plan file: [id].md
```

**Do not modify features.json.** Status changes happen in execute/commit.