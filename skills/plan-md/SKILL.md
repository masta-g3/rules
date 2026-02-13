---
name: plan-md
description: Create and maintain a Markdown implementation plan from a request.
argument-hint: "[request]"
---

Given request `$1`, create a scoped plan in `docs/plans/`.

Rules:
1. If input is `{epic}-{nnn}` use that ID as filename.
2. If `features.yaml` exists and input is not an ID, auto-register via:
   - `skills/plan-md/scripts/register_feature.sh "$1"`
3. Include context files, alternatives, phased checklists, and verification strategy.
4. If tracked feature plan, mark feature `in_progress`.
5. Advance autopilot state:
   - `skills/_lib/workflow_state.sh /execute`
