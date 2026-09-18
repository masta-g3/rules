# Ticket data reference

## Schema

Use a root-level sequence, not a mapping:

```yaml
- id: auth-001
  status: pending  # pending | in_progress | done | abandoned | superseded
  title: "Email signup"       # 1–3 words, max 32 normalized characters
  subtitle: "Validate email before account creation" # 4–6 words, max 64
  description: "User can create an account after email validation." # one sentence, max 240
  priority: 1
  created_at: 2024-01-15
  # persist only meaningful optional fields: depends_on, plan_file,
  # discovered_from, references, and terminal completion fields
```

New tickets require `id`, `status`, `title`, `subtitle`, `description`, `priority`, and `created_at`.

The ID prefix determines the epic. `register` accepts `epic` to allocate the ID but does not store it. Keep readers tolerant of legacy and unknown fields.

## Helper commands

Use `$SKILLS_ROOT/_lib/features_yaml.sh` to list epics, register tickets, select the next feature, inspect a feature, and update status or plan fields.

- `register` generates the ID and appends the ticket in one mutation.
- `get <feature-id> --output json` inspects one feature.
- `next-id` is for inspection, not reserving IDs before ticket creation.
- `describe` explains helper commands, not feature IDs.
