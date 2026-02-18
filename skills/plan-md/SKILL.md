---
name: plan-md
description: Create and maintain a Markdown implementation plan from a single request string.
argument-hint: "[request]"
---

Given the request: **$1**, create and maintain a detailed Markdown implementation plan as follows. Be sure to keep the scope limited to the specific request (i.e.: avoid scope creep).

### Plan File Location & Naming

Store plans in `docs/plans/`:

- **If input is a feature ID** (e.g., `auth-001: description`): use that ID → `auth-001.md`
- **If `features.yaml` exists** and input isn't an ID: register the feature inline —
  1. Extract existing epic prefixes: `yq '.[].id | sub("-[0-9]+$", "")' features.yaml | sort -u`
  2. Match the request to an existing epic, or create a new prefix if none fits. If ambiguous, ask the user.
  3. Generate the next ID: `~/.claude/skills/_lib/feature_id.sh features.yaml "$EPIC"`
  4. Append to features.yaml via `yq -i` with all required fields (id, epic, status: "in_progress", title, description, priority: 2, depends_on: [], spec_file: "docs/plans/{id}.md", created_at: today)
  → `{new-id}.md`
- **Otherwise**: standalone mode → `FEATURE_NAME.md`

### Clarify Before Planning

If unclear on scope, requirements, or constraints—ask the user before creating the plan (you can use the AskUserQuestion tool for this if available). Resolve what you can via codebase context and reasonable assumptions, but ask when genuinely needed.

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

### Parallel Mode (File Reservations)

If `$1` contains `--parallel`:
1. If `docs/plans/.file-locks.json` doesn't exist, create it with `{}`
2. After creating the plan, check the lock file against files in the Context Files section
3. Report any conflicts: "⚠ {file} is reserved by {feature-id}"
4. Informational only — no reservations placed during planning

### Mark Feature Active

**If plan file is named `{epic}-{nnn}.md` (tracked feature):** set its `status` to `"in_progress"` via yq. A finished plan is a commitment artifact—the feature is no longer pending.

### Plan Review (Non-Trivial Plans Only)

For plans involving architectural decisions, multi-file changes, or complex logic: invoke the **plan-critic** subagent via Task tool to review. Skip for trivial edits. Address valid concerns; ignore suggestions that add bloat.

---
## Autopilot State Transition

If `.claude/workflow.json` exists (autopilot is active), advance the workflow:
```bash
~/.claude/skills/_lib/workflow_state.sh /execute
```

On exception (ambiguous requirements), abort autopilot (`rm -f .claude/workflow.json`) and report the issue to the user.
