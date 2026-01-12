---
argument-hint: [request]
description: Create and maintain a Markdown implementation plan from a single request string.
disable-model-invocation: false
---

Given the request: **$1**, create and maintain a detailed Markdown implementation plan as follows. Be sure to keep the scope limited to the specific request (i.e.: avoid scope creep).

### Plan File Location & Naming

Store plans in `docs/plans/`:

- **If input is a feature ID** (e.g., `auth-001: description`): use that ID → `auth-001.md`
- **If `features.json` exists** and input isn't an ID: auto-register (infer epic, assign next number) → `{new-id}.md`
- **Otherwise**: standalone mode → `FEATURE_NAME.md`

### Clarify Before Planning

If unclear on scope, requirements, or constraints—ask the user before creating the plan (you can use the AskUserQuestion tool for this if available). Resolve what you can via codebase context and reasonable assumptions, but ask when genuinely needed.

### Create Plan

1. Create markdown document with the determined name.
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

Don't execute on this plan yet; the user will provide feedback and finally approve. After that, once you move to the implementation and make progress on it, verify if the plan actually corresponds to what was implemented, mark [x] what is completed, and if there are divergences, update the document. Keep a single document per session, and be sure to keep the scope limited to the feature request (specially when working with `features.json`).

### Plan Review (Non-Trivial Plans Only)

For plans involving architectural decisions, multi-file changes, or complex logic: invoke the **plan-critic** subagent via Task tool to review. Skip for trivial edits. Address valid concerns; ignore suggestions that add bloat.

---
## Autopilot State Transition

If `.claude/workflow.json` exists (autopilot is active), advance the workflow:
```bash
jq '.next = "/execute"' .claude/workflow.json > tmp.$$ && mv -f tmp.$$ .claude/workflow.json
```

On exception (ambiguous requirements), abort autopilot (`rm -f .claude/workflow.json`) and report the issue to the user.
