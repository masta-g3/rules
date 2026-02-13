---
name: ticket-init
description: Add a single ticket to features.yaml.
argument-hint: "[ticket description]"
disable-model-invocation: true
---

Given `$1`, append one feature entry to `features.yaml`.

Steps:
1. Determine epic from input or existing prefixes.
2. Generate ID using `skills/_lib/feature_id.sh`.
3. Append minimal schema entry with `status: pending` and today `created_at`.
4. Report created ticket ID, epic, and priority.

Do not implement or plan the feature here.
