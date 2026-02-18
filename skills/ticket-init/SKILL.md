---
name: ticket-init
description: Add a single ticket to features.yaml.
argument-hint: "[ticket description]"
disable-model-invocation: true
---

Given the ticket request: **$1**, add a single feature entry to `features.yaml`.

### 1. Determine Epic

Use the epic if mentioned in the description (e.g., "Auth: fix login bug"). Otherwise, extract existing prefixes and match semantically. If ambiguous or no match, ask the user.

```bash
yq '.[].id | sub("-[0-9]+$", "")' features.yaml | sort -u
```

### 2. Generate ID

Next sequential number within the epic using:
```bash
~/.claude/skills/_lib/feature_id.sh features.yaml "$EPIC"
```

### 3. Build & Append

```yaml
- id: "{epic}-{nnn}"
  epic: "{epic}"
  status: pending
  title: "{concise title}"
  description: "{action-oriented: 'User can [action] with [context]'}"
  steps:
    - "{implementation details if user provided, otherwise empty}"
  priority: 2
  depends_on: []
  discovered_from: null
  spec_file: null
  created_at: YYYY-MM-DD
```

Priority: `1`=foundation, `2`=core (default), `3`=polish — adjust if obvious from context.

```bash
yq -i '. += [{"id": "...", "epic": "...", "status": "pending", "title": "...", "description": "...", "priority": 2, "depends_on": [], "discovered_from": null, "spec_file": null, "created_at": "YYYY-MM-DD"}]' features.yaml
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
