---
name: next-feature
description: Select the next feature to implement from features.yaml and prepare for the atomic cycle.
disable-model-invocation: true
---

Set `$SKILLS_ROOT` to your harness skills path before helper commands: `~/.codex/skills` (Codex), `~/.claude/skills` (Claude), `~/.cursor/skills` (Cursor).

### 1. Review State

- Run `git log --oneline -10` to understand recent work
- Run `$SKILLS_ROOT/_lib/features_yaml.sh next` to find the next actionable feature
- Read `docs/STRUCTURE.md` only if feature context is unclear

### 2. Select Feature

Selection behavior:

1. If any feature is already `in_progress`, resume the highest-priority active item first.
2. Otherwise, identify **ready** `pending` features—those where all IDs in `depends_on` have `status: "done"`.

From ready `pending` features:
1. Prefer highest priority (1 before 2 before 3)
2. If tied, prefer earlier `created_at`, then earlier ID

If no features are ready:
- Check for blocked prerequisites
- If a dependency cycle is suspected, inspect it manually and report it to the user; do not auto-resolve
- Report situation to user; do not guess

Report the current active work plus a small set of next ready options. Keep it brief and to the point.

Default helper output now has three sections:

```
IN PROGRESS
- [id] (priority [n]): [description]

READY OPTIONS
1. [id] (priority [n], deps: [list or "none"])
   [description]

RECOMMENDED NEXT
[id]
Suggested plan file: docs/plans/[id].md
```

Rules:

- `IN PROGRESS` lists all active tracked features in the same order used for recommendation.
- `READY OPTIONS` lists up to the top few ready `pending` features by the same priority and tie-break rules as selection.
- `RECOMMENDED NEXT` remains the single canonical next item.
- If nothing is actionable, report the no-ready situation and include the first few blocked items with unmet dependencies instead of inventing a recommendation.

**Do not modify features.yaml.** Status changes happen in execute/commit.
