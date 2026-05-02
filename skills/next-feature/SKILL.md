---
name: next-feature
description: Select the next feature to implement from features.yaml.
---

Assume `SKILLS_ROOT` is set per `AGENTS.md` before running helper commands.

### 1. Review State

- Run `git log --oneline -10` to understand recent work
- Run `$SKILLS_ROOT/_lib/features_yaml.sh next` to find the next actionable feature
- Read `docs/STRUCTURE.md` only if feature context is unclear

### 2. Select Feature

Priority order: `in_progress` first (resume active work), then `pending` features whose `depends_on` are all `done`, ranked by priority (1 > 2 > 3), then `created_at`, then ID.

If nothing is ready, report blocked items and their unmet deps — do not guess or auto-resolve cycles.

Report active work and a few next-ready options. For multi-repo sessions, report per repo.

Default helper output has three sections:

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

### Output

When an actionable feature is recommended, end with `READY FOR PRIME`. If nothing is actionable, report the blocked/no-ready state instead.
