---
name: autopilot
description: Run complete feature cycle autonomously (Claude Code only).
argument-hint: "[feature-id | --epic prefix]"
model: claude-sonnet-4-5
disable-model-invocation: true
---

**Requires Claude Code with hooks enabled.**

If you are NOT running as Claude Code (no access to `.claude/settings.json` hooks), respond:
```
AUTOPILOT unavailable in this environment.
Use manual workflow: /prime → /plan-md → /execute → /commit
```
Then stop.

---

## Parse Arguments

**If `$1` is `--epic`:**
- Mode = `continuous`
- Epic prefix = `$2` (if provided, otherwise auto-detect from next ready feature)

**Otherwise:**
- Mode = `single`
- Feature ID = `$1` (if provided, otherwise pick next ready feature)

---

## Single Mode

Start workflow via:
```bash
~/.claude/skills/autopilot/scripts/start_workflow.sh single "$1"
```

If no feature found:
```
AUTOPILOT EXCEPTION: no_ready_features

No features with status "pending" and satisfied dependencies.

To add features: edit features.yaml or use /plan-md
```

Output:
```
AUTOPILOT STARTED: <feature-id>
```

---

## Continuous Mode

Start workflow via:
```bash
~/.claude/skills/autopilot/scripts/start_workflow.sh continuous "" "$2"
```

If no feature found:
```
AUTOPILOT EXCEPTION: no_ready_features

No features with status "pending" in epic "<prefix>".
```

Output:
```
AUTOPILOT STARTED (continuous): <epic-prefix> epic
First feature: <feature-id>
```

---

Do nothing else. The Stop hook will continue the workflow.
