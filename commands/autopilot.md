---
argument-hint: [feature-id | --epic prefix]
description: Run complete feature cycle autonomously (Claude Code only).
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

If `$1` is blank, query `features.yaml` for the next ready feature (status=pending, dependencies satisfied):

```bash
yq '
  ([.[] | select(.status == "done") | .id]) as $done |
  [.[] | select(
    .status == "pending" and
    ((.depends_on // []) | all_c(. as $dep | $done | any_c(. == $dep)))
  )] |
  sort_by(.priority, .created_at) |
  .[0].id // ""
' features.yaml
```

If none found:
```
AUTOPILOT EXCEPTION: no_ready_features

No features with status "pending" and satisfied dependencies.

To add features: edit features.yaml or use /plan-md
```

Write to `.claude/workflow.json`:
```json
{
  "mode": "single",
  "feature": "<feature-id>",
  "next": "/prime"
}
```

Output:
```
AUTOPILOT STARTED: <feature-id>
```

---

## Continuous Mode

If mode=continuous:

### 1. Determine epic scope

If epic prefix provided (`$2`): use it.

Otherwise, use the Single Mode yq query to get `FEATURE`, then extract epic prefix:
```bash
EPIC=$(echo "$FEATURE" | sed 's/-[0-9]*$//')
```

### 2. Find first ready feature in epic

```bash
EPIC="$EPIC" yq '
  ([.[] | select(.status == "done") | .id]) as $done |
  [.[] | select(
    .status == "pending" and
    (.id | test(env(EPIC))) and
    ((.depends_on // []) | all_c(. as $dep | $done | any_c(. == $dep)))
  )] |
  sort_by(.priority, .created_at) |
  .[0].id // ""
' features.yaml
```

If none found:
```
AUTOPILOT EXCEPTION: no_ready_features

No features with status "pending" in epic "<prefix>".
```

### 3. Write workflow.json

```json
{
  "mode": "continuous",
  "epic": "<epic-prefix>",
  "feature": "<first-feature-id>",
  "next": "/prime"
}
```

### 4. Output

```
AUTOPILOT STARTED (continuous): <epic-prefix> epic
First feature: <feature-id>
```

---

Do nothing else. The Stop hook will continue the workflow.
