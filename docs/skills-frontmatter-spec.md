# Skills Frontmatter Spec (Minimal)

## Goal

Keep frontmatter lightweight. Only include fields that affect runtime behavior.

## Standard

Use only these keys by default:
- `name`
- `description`
- `argument-hint` (only when the skill takes arguments)
- `disable-model-invocation` (only when true/required)
- `model` (only when explicitly pinned)

Everything else is optional and should be omitted unless an actual tool/parser in use requires it.

## Minimal Examples

Read-only deterministic skill:

```yaml
---
name: next-feature
description: Select the next feature to implement from features.yaml.
disable-model-invocation: true
---
```

Mutating workflow skill:

```yaml
---
name: execute
description: Implement the approved plan.
---
```

Provider-specific pinned skill:

```yaml
---
name: autopilot
description: Run complete feature cycle autonomously (Claude Code only).
argument-hint: "[feature-id | --epic prefix]"
model: claude-sonnet-4-5
disable-model-invocation: true
---
```

## Rule of Thumb

If removing a frontmatter key does not change behavior, remove it.
