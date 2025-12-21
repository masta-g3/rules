---
argument-hint: [request]
description: Create and maintain a Markdown implementation plan from a single request string.
disable-model-invocation: true
---

Given the request: **$1**, create and maintain a detailed Markdown implementation plan as follows. Be sure to keep the scope limited to the specific request (i.e.: avoid scope creep).

### Plan File Naming

- **If input is a feature ID** (e.g., `auth-001: description`): use that ID → `auth-001.md`
- **If `features.json` exists** and input isn't an ID: auto-register (infer epic, assign next number) → `{new-id}.md`
- **Otherwise**: standalone mode → `FEATURE_NAME.md`

### Clarify Before Planning

If unclear on scope, requirements, or constraints—ask the user before creating the plan. Resolve what you can via codebase context and reasonable assumptions, but ask when genuinely needed.

### Create Plan

1. Create markdown document with the determined name.
2. Brainstorm solution alternatives that align with current style (modular, lightweight, clean, avoid corporate bloat).
3. Write out a detailed implementation plan with precise details (code snippets, file names, etc.) on all the steps needed. Include an architectural layout that maps components, data flows, and dependencies. Think of this as an implementation guide for a junior engineer.
   - For substantial features (full fledged features, rewrites, multi-service work): aim for 200+ lines, including pseudocode, diagrams, and breakdowns.
   - For minor edits or narrow fixes: keep it as concise as the change warrants.
4. Add an implementation section that divides work into incremental phases—foundation first, then progressive refinement. Each phase should produce testable, reviewable output (e.g., architecture setup → core components → specific features → polish). Use [ ] checkboxes to track progress within each phase.

5. If this feature involves UI work, include a design direction section:
   - Typography: choose distinctive, beautiful fonts—avoid generic defaults (Inter, Roboto, system fonts)
   - Color: commit to a cohesive theme with CSS variables; bold accents over timid palettes
   - Centralize design tokens (colors, spacing, typography) in theme config or CSS variables—no scattered magic values
   - Avoid "AI slop": no generic purple gradients, no cookie-cutter layouts, no predictable patterns
   - Use the frontend design skill if available

6. If this feature touches critical paths, include a testing phase:
   - **Data integrity**: validation, sanitization, transformations
   - **Auth/permissions**: login flows, access control, token handling
   - **Business logic**: calculations, state transitions, domain rules
   - **Integrations**: API calls, database operations, external services

   Add 1-3 focused tests as a phase. Test outcomes, not implementation details. Persistent tests go under `tests/`; ephemeral tests for one-off validation.

   **Skip testing for**: trivial changes, UI-only work, glue code, or well-covered areas. Not every feature needs tests—only where bugs have real consequences.

Don't execute on this plan yet; the user will provide feedback and finally approve. After that, once you move to the implementation and make progress on it, verify if the plan actually corresponds to what was implemented, mark [x] what is completed, and if there are divergences, update the document. Keep a single document per session, and be sure to keep the scope limited to the feature request (specially when working with `features.json`).

---
## Autopilot State Transition

If `.claude/workflow.json` exists (autopilot is active), advance the workflow:
```bash
jq '.next = "/execute"' .claude/workflow.json > tmp.$$ && mv -f tmp.$$ .claude/workflow.json
```

On exception (ambiguous requirements that cannot be resolved), abort autopilot:
```bash
rm -f .claude/workflow.json
```
```
AUTOPILOT EXCEPTION: ambiguous_requirements

Cannot determine implementation approach for: <feature description>

Unclear aspects:
- <what's ambiguous>

To resume after clarifying: /autopilot <feature-id>
```
