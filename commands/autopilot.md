---
argument-hint: [feature-id | --epic prefix]
description: Run complete feature cycle autonomously (Claude Code only).
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

If mode=single, select feature as before.

If `$1` is blank, query `features.json` for the next ready feature (status=pending, dependencies satisfied):

```bash
jq -r '
  ([.[] | select(.status == "done") | .id]) as $done |
  [.[] | select(
    .status == "pending" and
    ((.depends_on // []) | all(. as $dep | $done | index($dep)))
  )] |
  sort_by(.priority, .created_at) |
  .[0].id // empty
' features.json
```

If none found:
```
AUTOPILOT EXCEPTION: no_ready_features

No features with status "pending" and satisfied dependencies.

To add features: edit features.json or use /plan-md
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

Otherwise, find next globally ready feature and extract its epic prefix:
```bash
FEATURE=$(jq -r '
  ([.[] | select(.status == "done") | .id]) as $done |
  [.[] | select(
    .status == "pending" and
    ((.depends_on // []) | all(. as $dep | $done | index($dep)))
  )] |
  sort_by(.priority, .created_at) |
  .[0].id // empty
' features.json)

# Extract epic prefix (e.g., "auth-001" → "auth")
EPIC=$(echo "$FEATURE" | sed 's/-[0-9]*$//')
```

### 2. Find first ready feature in epic

```bash
jq -r --arg e "$EPIC" '
  ([.[] | select(.status == "done") | .id]) as $done |
  [.[] | select(
    .status == "pending" and
    (.id | startswith($e)) and
    ((.depends_on // []) | all(. as $dep | $done | index($dep)))
  )] |
  sort_by(.priority, .created_at) |
  .[0].id // empty
' features.json
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
