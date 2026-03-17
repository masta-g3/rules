## Experimental Autopilot Workflow

This document is a standalone prompt/reference for the experimental autopilot flow.

It is **not** part of the default workflow and is **not** included in `AGENTS.md`.
Use it only when explicitly running the autopilot flow or another prompt that links here.

If a Stop hook blocks with a reason starting with `AUTOPILOT:`, execute the slash command specified.

Example:
`AUTOPILOT: Run /prime auth-001` -> immediately run `/prime auth-001`

## Autopilot State Transition

If `.claude/workflow.json` does not exist, skip this section entirely.

### Advance State

Each skill advances the workflow to the next command after completing successfully:

| Skill | Next command | Condition | Abort trigger |
|-------|-------------|-----------|---------------|
| prime | `/plan-md` | workflow.json exists | — |
| plan-md | `/execute` | workflow.json exists | ambiguous requirements |
| execute | `/commit` | workflow.json exists AND plan complete | baseline/tests/build fail |
| commit | *(see below)* | workflow.json exists | git conflicts |

For **prime**, **plan-md**, and **execute**, advance with:
```bash
$SKILLS_ROOT/_lib/workflow_state.sh <next-command>
```

### Commit — Mode-Dependent Transition

Commit reads the workflow mode and branches:

```bash
MODE=$(jq -r '.mode // "single"' .claude/workflow.json)
```

**Single mode:**
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

**Continuous mode:**
```bash
if [[ "$MODE" == "continuous" ]]; then
  EPIC=$(jq -r '.epic' .claude/workflow.json)

  # Find next ready feature in epic
  NEXT_FEATURE=$($SKILLS_ROOT/_lib/features_yaml.sh --file features.yaml --output id next --epic "$EPIC")

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

### Exception Handling

On exception (matching the abort trigger for the current skill), abort autopilot and report to user:
```bash
rm -f .claude/workflow.json
```
