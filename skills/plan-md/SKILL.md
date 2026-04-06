---
name: plan-md
description: Create and maintain a Markdown implementation plan from a single request string.
argument-hint: "[request]"
---

Assume `SKILLS_ROOT` is set per `AGENTS.md` before running helper commands.

Given the provided request, create and maintain a detailed Markdown implementation plan as follows. Be sure to keep the scope limited to the specific request (i.e.: avoid scope creep).

### Plan File Location & Naming

Store plans in `docs/plans/`:

- **If the provided request already identifies a feature ID** (e.g., `auth-001` or `auth-001: description`): use that ID → `auth-001.md`
- **If `features.yaml` exists** and input is not already a tracked feature ID: create the ticket first via `ticket-init`, then plan against the returned ID.
  - Only do this when a new tracked ticket is actually needed.
  - Do not restate epic matching, ID generation, or append mechanics here; `ticket-init` owns that workflow.
  - After ticket creation, set the feature's `plan_file` to `docs/plans/<feature-id>.md` with `$SKILLS_ROOT/_lib/features_yaml.sh update "<feature-id>" --json '{"plan_file":"docs/plans/<feature-id>.md"}'` if needed, then write the plan there.
- **Otherwise**: standalone mode → `FEATURE_NAME.md`

### Clarify Before Planning

If unclear on scope, requirements, or constraints, ask the user before creating the plan. Resolve what you can via codebase context and reasonable assumptions, but ask when genuinely needed.

### Context Files

Include a section listing files to read before implementing:

- **Core**: files directly modified or extended
- **Reference**: existing patterns to follow, related utilities
- **Config**: relevant settings, types, schemas

Keep it lean—only what's needed to start confidently.

### Create Plan

1. Create markdown document with the determined name. Start with a one-liner: `**Feature:** {id} → {description}`
2. Brainstorm solution alternatives that align with current style (modular, lightweight, clean, avoid corporate bloat).
3. Write out a detailed implementation plan with precise details (code snippets, file names, etc.) on all the steps needed. Include an architectural layout that maps components, data flows, and dependencies. Think of this as an implementation guide for a junior engineer.
   - For substantial features (full fledged features, rewrites, multi-service work): aim for 200+ lines, including pseudocode, diagrams, and breakdowns.
   - For minor edits or narrow fixes: keep it as concise as the change warrants.

4. If this feature involves UI work, include a design direction section:
   - Use the frontend design skill if available
   - Typography: choose distinctive, beautiful fonts—avoid generic defaults (Inter, Roboto, system fonts)
   - Color: commit to a cohesive theme with CSS variables; bold accents over timid palettes
   - Centralize design tokens (colors, spacing, typography) in theme config or CSS variables—no scattered magic values
   - Avoid "AI slop": no generic purple gradients, no cookie-cutter layouts, no predictable patterns

5. Add an implementation section that divides work into incremental phases—foundation first, then progressive refinement (e.g., architecture setup → core components → specific features → polish). Use [ ] checkboxes to track progress. End each phase with a verification step to confirm it works and didn't break existing functionality.

6. Include a **verification strategy** for each phase:
   - Focus on outcomes, not syntax: "Does it achieve the goal?" not "Does it import?"
   - For side effects: test actual workflows end-to-end, but keep operations read-only or ephemeral (no real state mutations)
   - For pure logic: test with realistic inputs and edge cases
   - If a function's only test is that it exists, it's not tested

Don't execute on this plan yet; the user will provide feedback and finally approve. Keep scope limited to the feature request (especially when working with `features.yaml`).

### Preserve Pending Status

**If plan file is named `{epic}-{nnn}.md` (tracked feature):** keep its `status` as `"pending"`. Planning prepares implementation but does not activate the work; `execute` owns the `pending` → `in_progress` transition.

If the work already has a tracked ticket, plan against it directly and do not load `ticket-init`.

### Plan Review (Non-Trivial Plans Only)

For plans involving architectural decisions, multi-file changes, or complex logic, invoke the **plan-critic** reviewer subagent once. Skip for trivial edits. Fix only clear correctness, completeness, or simplicity issues; ignore nits and re-run only after material plan changes.
