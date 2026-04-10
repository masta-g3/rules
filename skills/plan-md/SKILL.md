---
name: plan-md
description: Create and maintain a Markdown implementation plan for a feature or task.
argument-hint: "[request]"
---

Create a detailed Markdown implementation plan for the provided request. Avoid scope creep.

If unclear on scope or requirements, ask the user with the user ask tool before planning.

### Plan File Location & Naming

Store plans in `docs/plans/`:

- **If the request identifies a feature ID** (e.g., `auth-001`): use that ID → `auth-001.md`
- **If `features.yaml` exists** and input is not a tracked feature ID: create the ticket via `ticket-init` skill, then plan against the returned ID.
  Update `plan_file`: `$SKILLS_ROOT/_lib/features_yaml.sh update "<feature-id>" --json '{"plan_file":"docs/plans/<feature-id>.md"}'`
- **Otherwise**: standalone mode → `FEATURE_NAME.md`

### Context Files

Include a context-files section:

- **Core**: files directly modified or extended
- **Reference**: existing patterns to follow, related utilities
- **Config**: relevant settings, types, schemas

### Create Plan

1. Create markdown document with the determined name. Start with a one-liner: `**Feature:** {id} → {description}`
2. Brainstorm solution alternatives — prefer the approach with the smallest surface area and simplest implementation.
3. Write a detailed implementation plan (code snippets, file paths, architecture layout with components, data flows, and dependencies). Scale depth to complexity:
   - Substantial features (rewrites, multi-service work): 200+ lines with pseudocode, diagrams, and breakdowns.
   - Minor edits or narrow fixes: as concise as the change warrants.

4. If UI work, include a design direction section. Use the **frontend design skill** if available; otherwise specify theme tokens, typography, and color choices centrally — no scattered magic values.

5. Divide into incremental phases (foundation → core → polish), each with its own `[ ]` checklist and a verification step at the end.
   - **Bulk-change checklist:** for cross-cutting changes (20+ files), enumerate every affected file in a `[ ]` checklist grouped by directory or module.

6. Include a **verification strategy** for each phase:
   - Focus on outcomes: "Does it achieve the goal?" not "Does it import?"
   - Side effects: test workflows end-to-end, keep operations read-only or ephemeral
   - Pure logic: test with realistic inputs and edge cases

Don't execute on this plan yet; the user will provide feedback and approve.

### Preserve Pending Status

**If plan file is named `{epic}-{nnn}.md` (tracked feature):** keep its `status` as `"pending"`. Planning prepares implementation but does not activate the work; `execute` owns the `pending` → `in_progress` transition.

### Plan Review (Non-Trivial Plans Only)

For plans involving architectural decisions, multi-file changes, or complex logic, invoke the **plan-critic** reviewer subagent once. Skip for trivial edits. Fix only clear correctness, completeness, or simplicity issues; ignore nits, decontextualized suggestions, and proposals that don't fit project constraints. Re-run only after material plan changes.
