---
argument-hint: [ticket description]
description: Add a single ticket to features.json.
disable-model-invocation: true
---

Given the ticket request: **$1**, add a single feature entry to `features.json`.

### 1. Determine Epic

Use the epic if mentioned in the description (e.g., "Auth: fix login bug"). Otherwise, extract existing prefixes and match semantically. If ambiguous or no match, ask the user.

```bash
jq -r '[.[] | .id | split("-")[:-1] | join("-")] | unique | .[]' features.json
```

### 2. Generate ID

Next sequential number within the epic, zero-padded to 3 digits (`pv-008`):

```bash
jq -r --arg e "$EPIC" '
  [.[] | select(.id | startswith($e + "-")) | .id | split("-")[-1] | tonumber] |
  (max // 0) + 1
' features.json
```

### 3. Build & Append

```json
{
  "id": "{epic}-{nnn}",
  "epic": "{epic}",
  "status": "pending",
  "title": "{concise title}",
  "description": "{action-oriented: 'User can [action] with [context]'}",
  "steps": ["{implementation details if user provided, otherwise empty}"],
  "priority": 2,
  "depends_on": [],
  "discovered_from": null,
  "spec_file": null,
  "created_at": "YYYY-MM-DD"
}
```

Priority: `1`=foundation, `2`=core (default), `3`=polish — adjust if obvious from context.

```bash
jq --argjson entry '<json>' '. += [$entry]' features.json > tmp.$$ && mv tmp.$$ features.json
```

### 4. Report

```
TICKET CREATED: {id}
Epic: {epic}
Title: {title}
Priority: {priority}
```

---

**Do not plan or implement.** This command only registers work. Use `/plan-md` to plan and `/execute` to implement.
