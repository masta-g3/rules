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

Author three distinct display fields. Normalize whitespace before checking limits.

- `title`: 1–3 concrete words, at most 32 Unicode characters. This becomes Pi's native session name.
- `subtitle`: 4–6 words stating the concrete outcome. It must clarify the title without the description. Avoid vague activity verbs. Max 64 characters.
- `description`: one concise outcome sentence, at most 240 characters.

Do not prefix text with a ticket ID. Never write `steps`; detailed scope and checklists belong in the Markdown plan. Omit empty arrays, empty strings, null placeholders, and unassigned optional fields. `epic` allocates the ID but is not persisted.

```bash
$SKILLS_ROOT/_lib/features_yaml.sh register --json '{"epic":"auth","title":"Email signup","subtitle":"Validate email before account creation","description":"User can create an account after email validation.","priority":2}'
```

Priority: 1=foundation, 2=core (default), 3=polish.

### Output

```
TICKET CREATED: {id}
Epic: {epic}
Title: {title}
Subtitle: {subtitle}
Priority: {priority}
```

**Boundary:** this command only registers work.
