---
argument-hint: [feature-id]
description: Run complete feature cycle autonomously.
---

Initialize autopilot workflow for feature: `$1`

If `$1` is blank, first query `features.json` for the next ready feature (status=pending, dependencies satisfied). If none found:
```
AUTOPILOT EXCEPTION: no_ready_features

No features with status "pending" and satisfied dependencies.

To add features: edit features.json or use /plan-md
```

Once you have a feature ID, write to `.claude/workflow.json`:
```json
{
  "feature": "<feature-id>",
  "next": "/prime"
}
```

Output:
```
AUTOPILOT STARTED: <feature-id>
```

Do nothing else. The Stop hook will continue the workflow.
