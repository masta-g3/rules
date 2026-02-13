---
name: autopilot
description: Run complete feature cycle autonomously (Claude Code only).
argument-hint: "[feature-id | --epic prefix]"
model: claude-sonnet-4-5
disable-model-invocation: true
---

Claude-only behavior.

If hooks are unavailable, return:
```
AUTOPILOT unavailable in this environment.
Use manual workflow: /prime -> /plan-md -> /execute -> /commit
```

Start workflow state via:
- single mode: `skills/autopilot/scripts/start_workflow.sh single "$1"`
- continuous mode: `skills/autopilot/scripts/start_workflow.sh continuous "" "$2"`
