---
name: plan-md
description: Create and maintain a Markdown implementation plan for a feature or task.
argument-hint: "[request]"
metadata:
  thinkingLevel: high
---

Create a detailed Markdown implementation plan for the provided request. Avoid scope creep.

### Pre-Work & User Interview

Before writing the plan, investigate the codebase to resolve discoverable facts, then interview the user about the decisions that remain. Ask one decision question at a time, include your recommended answer and rationale, and wait for feedback before continuing. Resolve dependent decisions in order until scope, approach, dependencies, product direction, domain concepts, boundaries, and trade-offs are mutually understood. Do not batch questions or carry unresolved assumptions into the plan. Write the plan only after the user confirms shared understanding; never implement it during this skill.

### Plan File Location & Naming

Store plans in `agent-work/plans/`:

- If the request names a feature ID, use it. Otherwise create one with the `ticket-init` skill.
- Write the plan to `agent-work/plans/<feature-id>.md`, update `plan_file`, and call `set_workflow_ticket` when available:
  `$SKILLS_ROOT/_lib/features_yaml.sh update "<feature-id>" --json '{"plan_file":"agent-work/plans/<feature-id>.md"}'`
- If `agent-work/features.yaml` does not exist, use `agent-work/plans/FEATURE_NAME.md`.

### Context Files

Include a context-files section:

- **Core**: files directly modified or extended
- **Reference**: existing patterns to follow, related utilities or documents

### Create Plan

1. Create markdown document with the determined name. Start with:
   - `**Feature:** {id} → {description}`
   - `**Session:** {harness session ID}`

2. Brainstorm solution alternatives — prefer the approach with the smallest surface area and simplest implementation.

3. Write a detailed implementation plan (code snippets, file paths, architecture layout with components, data flows, and dependencies). Scale depth to complexity; use pseudocode, diagrams, and breakdowns as needed.

4. If UI work, include a design direction section. Brainstorm with the `frontend designer` subagent if available. Specify theme tokens, typography, and color choices centrally — no scattered magic values.

5. Divide into incremental test-first phases (foundation → core → polish), each with its own list of `[ ]` checklists and final verification step. For implementation phases, write/update the failing test first, make the smallest passing change, then refactor.
 
6. Include a **verification strategy** for each phase:
   - Focus on outcomes: "Does it achieve the goal?" not "Does it import?"
   - Side effects: test workflows end-to-end, with the smallest necessary impact area
   - Pure logic: test with realistic inputs and edge cases

Don't execute on this plan yet; the user will provide feedback and approve.

7. Note likely doc impacts as `Reflection Candidates` for `/reflect`.

### Preserve Pending Status

**If plan file is named `{epic}-{nnn}.md` (tracked feature):** keep its `status` as `"pending"`. Planning prepares implementation but does not activate the work; `execute` owns the `pending` → `in_progress` transition.

### Plan Review (Non-Trivial Plans Only)

For plans involving architectural decisions, multi-file changes, or complex logic, invoke the **plan-critic** subagent. Fix only clear correctness, completeness, or simplicity issues; ignore nits, decontextualized suggestions, scope creep and proposals that don't fit project constraints. Re-run only after material plan changes.

### Output

For successful planning, report the plan path, include a `Summary:` line with 1-2 sentences on the planned approach, then end with `READY FOR EXECUTE`. If planning is blocked, report `BLOCKED — <reason>`.
