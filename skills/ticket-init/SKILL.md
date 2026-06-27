---
name: ticket-init
description: Add one or more tickets to agent-work/features.yaml.
argument-hint: "[ticket description(s) in natural language]"
disable-model-invocation: true
metadata:
  thinkingLevel: medium
---

Given the provided ticket request(s), add one or more feature entries to `agent-work/features.yaml`.

### 0. Normalize Input

Read the input as natural language. Infer whether it describes one ticket or multiple distinct tickets based on meaning — look for conjunctions ("and", "also"), comma-separated tasks, or clearly independent work items. When in doubt, prefer fewer tickets (group related work). Process each ticket independently using steps 1-4.

### 1. Determine Epic

Use the epic if mentioned in the description. Otherwise, extract existing prefixes and match semantically. If ambiguous or no match, ask the user.

Epic prefixes should be concise, self-explanatory slugs of 1-3 short words, usually lowercase kebab-case. Prefer creating a new focused epic over adding unrelated tickets to a broad or muddy existing epic. Reuse an existing epic only when the ticket clearly belongs to the same coherent work area.

```bash
$SKILLS_ROOT/_lib/features_yaml.sh epics
```

### 2. Register Ticket

For each ticket request, register the feature under the chosen epic. The helper generates the next ticket ID during creation.

```yaml
epic: "{epic}"
status: pending
title: "{concise title}"
description: "{action-oriented: 'User can [action] with [context]'}"
steps:
  - "{implementation details if user provided, otherwise empty}"
priority: 2  # 1=foundation, 2=core (default), 3=polish
created_at: YYYY-MM-DD
```

Register:
```bash
$SKILLS_ROOT/_lib/features_yaml.sh register --json '{"epic":"...","status":"pending","title":"...","description":"...","steps":[],"priority":2,"depends_on":[],"discovered_from":null,"plan_file":null,"references":[],"created_at":"YYYY-MM-DD"}'
```

### 3. Report

```
TICKET CREATED: {id}
Epic: {epic}
Title: {title}
Priority: {priority}
```

---

**Do not write down a plan or implement yet.** This command only registers work. Use `/plan-md` to plan and `/execute` to implement.
