---
name: plan-md
description: Create and maintain a Markdown implementation plan for a feature or task.
argument-hint: "[request]"
metadata:
  thinkingLevel: high
---

Create a detailed Markdown implementation plan for the provided request. Avoid scope creep.

If scope, approach, or dependencies are unclear, investigate repo-answerable questions first, then interview the user with the user ask tool before planning — walk through each decision branch one at a time. Don't carry unresolved assumptions forward.

When the user asks to reason through a design, or the request is too broad or conceptually ambiguous to plan safely, enter design-interview mode before writing the plan: ask one question at a time, explain your recommended answer, and continue until the product direction, domain concepts, boundaries, and tradeoffs are resolved enough to plan.

### Plan File Location & Naming

Store plans in `agent-work/plans/`:

- **If the request identifies a feature ID** (e.g., `auth-001`): use that ID → `agent-work/plans/auth-001.md`
- **If `agent-work/features.yaml` exists** and input is not a tracked feature ID: create the ticket via `ticket-init` skill, then plan against the returned ID.
  Update `plan_file`: `$SKILLS_ROOT/_lib/features_yaml.sh update "<feature-id>" --json '{"plan_file":"agent-work/plans/<feature-id>.md"}'`
- **Tracked work:** if `set_workflow_ticket` is available, call it with the resolved feature ID.
- **Otherwise**: standalone mode → `agent-work/plans/FEATURE_NAME.md`

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

5. Divide into incremental test-first phases (foundation → core → polish), each with its own `[ ]` checklist and verification step. For implementation phases, write/update the failing test first, make the smallest passing change, then refactor.
   - **Bulk-change checklist:** for cross-cutting changes (20+ files), enumerate every affected file in a `[ ]` checklist grouped by directory or module.

6. Include a **verification strategy** for each phase:
   - Focus on outcomes: "Does it achieve the goal?" not "Does it import?"
   - Side effects: test workflows end-to-end, keep operations read-only or ephemeral
   - Pure logic: test with realistic inputs and edge cases

Don't execute on this plan yet; the user will provide feedback and approve.

### Documentation

Only plan doc updates when they are explicit deliverables; otherwise note likely doc impacts as `Reflection Candidates` for `/reflect`.

### Preserve Pending Status

**If plan file is named `{epic}-{nnn}.md` (tracked feature):** keep its `status` as `"pending"`. Planning prepares implementation but does not activate the work; `execute` owns the `pending` → `in_progress` transition.

### Plan Review (Non-Trivial Plans Only)

For plans involving architectural decisions, multi-file changes, or complex logic, invoke the **plan-critic** subagent once. Skip for trivial edits. Fix only clear correctness, completeness, or simplicity issues; ignore nits, decontextualized suggestions, scope creep and proposals that don't fit project constraints. Re-run only after material plan changes.

### Output

For successful planning, report the plan path, include a `Summary:` line with 1-2 sentences on the planned approach, then end with `READY FOR EXECUTE`. If planning is blocked, report `BLOCKED — <reason>`.
