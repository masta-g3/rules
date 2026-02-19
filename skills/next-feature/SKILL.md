---
name: next-feature
description: Select the next feature to implement from features.yaml and prepare for the atomic cycle.
disable-model-invocation: true
---

Set `$SKILLS_ROOT` to your harness skills path before helper commands: `~/.codex/skills` (Codex), `~/.claude/skills` (Claude), `~/.cursor/skills` (Cursor).

### 1. Review State

- Run `git log --oneline -10` to understand recent work
- Run `$SKILLS_ROOT/_lib/select_next_feature.sh features.yaml` to find the next ready feature
- Read `docs/STRUCTURE.md` only if feature context is unclear

### 2. Select Feature

Identify **ready** features—those where:
- `status` is `"pending"`
- All IDs in `depends_on` have `status: "done"` or `"in_progress"`

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

**Do not modify features.yaml.** Status changes happen in execute/commit.
