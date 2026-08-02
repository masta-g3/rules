---
name: ticket-init
description: Add one or more tickets to agent-work/features.yaml.
argument-hint: "[ticket description(s) in natural language]"
disable-model-invocation: true
metadata:
  thinkingLevel: low
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

Register each ticket under the chosen epic; the helper generates the ID.

Write an authored title that targets 5-7 words and uses no more than 48 characters. This title becomes the dashboard's `plan.feature` description, so keep it longer than a short Hub session label. Do not prefix it with a ticket ID. Keep the full user outcome and relevant context in the description instead of shortening them to fit the title.

```bash
$SKILLS_ROOT/_lib/features_yaml.sh register --json '{"epic":"...","status":"pending","title":"{5-7 words, max 48 characters, no ticket ID}","description":"User can [action] with [context]","steps":["{only if user provided}"],"priority":2,"depends_on":[],"discovered_from":null,"plan_file":null,"references":[],"created_at":"YYYY-MM-DD"}'
```

Priority: 1=foundation, 2=core (default), 3=polish.

### Output

```
TICKET CREATED: {id}
Epic: {epic}
Title: {title}
Priority: {priority}
```

**Boundary:** this command only registers work.
