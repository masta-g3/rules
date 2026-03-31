---
name: autopilot
description: Run complete feature cycle autonomously (Claude Code only).
argument-hint: "[feature-id | --epic [epic-prefix]]"
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

**If the provided input starts with `--epic`:**
- Mode = `continuous`
- Epic prefix = the provided epic prefix, if any; otherwise auto-detect from the next ready feature

**Otherwise:**
- Mode = `single`
- Feature ID = the provided feature ID, if any; otherwise pick the next ready feature

---

## Single Mode

If a feature ID was provided, start workflow via:
```bash
~/.claude/skills/autopilot/scripts/start_workflow.sh single <feature-id>
```

Otherwise, omit the final argument and let the script pick the next ready feature.

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

If an epic prefix was provided, start workflow via:
```bash
~/.claude/skills/autopilot/scripts/start_workflow.sh continuous "" <epic-prefix>
```

Otherwise, omit the final argument and let the script auto-detect the next ready epic.

If no feature found:
```
AUTOPILOT EXCEPTION: no_ready_features

No features with status "pending" in epic "<epic-prefix>".
```

Output:
```
AUTOPILOT STARTED (continuous): <epic-prefix> epic
First feature: <feature-id>
```

---

Do nothing else. The Stop hook will continue the workflow.
