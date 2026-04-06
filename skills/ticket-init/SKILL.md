---
name: ticket-init
description: Add one or more tickets to features.yaml.
argument-hint: "[ticket description] or \"ticket 1 || ticket 2\""
disable-model-invocation: true
---

Assume `SKILLS_ROOT` is set per `AGENTS.md` before running helper commands.

Given the provided ticket request(s), add one or more feature entries to `features.yaml`.

This is the canonical workflow for ticket creation. Other skills should invoke `ticket-init` when they need to register tracked work, instead of restating ticket-creation steps inline.

### 0. Normalize Input

- If the provided ticket input contains ` || `, split it into multiple ticket requests.
- Otherwise, treat it as a single ticket request.
- Process each request independently, in order, using steps 1-4.
- Backward compatibility: single-ticket behavior stays unchanged.

Example multi-ticket input:
`/ticket-init "Add GICS industry toggle || Add issuer-first cap-weighted aggregation"`

### 1. Determine Epic

Use the epic if mentioned in the description (e.g., "Auth: fix login bug"). Otherwise, extract existing prefixes and match semantically. If ambiguous or no match, ask the user.

```bash
$SKILLS_ROOT/_lib/features_yaml.sh epics
```

### 2. Generate ID

For each ticket request, generate the next sequential number within the epic:
```bash
$SKILLS_ROOT/_lib/features_yaml.sh next-id "$EPIC"
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
  plan_file: null
  references: []
  created_at: YYYY-MM-DD
```

Priority: `1`=foundation, `2`=core (default), `3`=polish — adjust if obvious from context.

Append with the repo-local helper instead of inline YAML mutation:
```bash
$SKILLS_ROOT/_lib/features_yaml.sh create --json '{"id":"...","epic":"...","status":"pending","title":"...","description":"...","steps":[],"priority":2,"depends_on":[],"discovered_from":null,"plan_file":null,"references":[],"created_at":"YYYY-MM-DD"}'
```

### 4. Report

Emit one block per ticket:
```
TICKET CREATED: {id}
Epic: {epic}
Title: {title}
Priority: {priority}
```

---

**Do not plan or implement.** This command only registers work. Use `/plan-md` to plan and `/execute` to implement.
