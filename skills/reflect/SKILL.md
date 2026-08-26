---
name: reflect
description: Reflect on reviewed work and update durable docs or agent guidance before commit.
metadata:
  thinkingLevel: medium
---

Update durable documentation and agent guidance after implementation has passed review, so docs describe the final reviewed result.

### Process

The step starts with `reviewing-guidance` as its default activity.

1. Inspect the active plan, review output, the conversation with the user, `git status --short`, and changed files.
2. Identify the highest-value durable documentation gaps by asking: what missing context could cause future users, maintainers, or agents to make wrong decisions, and who would act differently if it were documented? Route each gap to its owner:
   - project purpose, target user, project type, project stage, operating assumptions, or shared terminology → `CONTEXT.md`
   - users/operators → `README.md`
   - human developers learning architecture/layout/core patterns → `docs/STRUCTURE.md`
   - product/API/design truth → the relevant domain doc
   - recurring agent mistakes, user corrections, review findings, or counterintuitive workflow pitfalls → the project-local `AGENTS.md`
   - repeatable project workflows already encoded in project-local skills or agent configuration → update the owning file; do not create new skills or modify user-global configuration unless explicitly requested
3. For non-trivial durable doc/guidance edits, call `updating-guidance` when available before edits, then invoke the `docs-critic` subagent. Skip when there are no edits or only tiny mechanical fixes such as typos, links, paths, or formatting. Act on its feedback per the AGENTS.md critic rule; deleting the update is acceptable when the critique shows it is not worth keeping.

### Editing Rules

- Add only the delta that will change future behavior. Prefer editing, replacing, or deleting stale text over appending, and never duplicate what a doc already says.
- Docs describe current state, not history — no migration, compatibility, or "previously..." notes unless a public contract or operator action depends on them.
- If a learning fits both a domain doc and `AGENTS.md`, put the full truth in the domain doc and add a short `AGENTS.md` pointer only if agents are likely to miss it.
- Treat project-local `AGENTS.md` as compact task-execution guardrails, not an append-only memory log: edit, merge, tighten, move to `docs/STRUCTURE.md`, or delete existing guidance before adding a rule.
- Update `CONTEXT.md` only when project meaning, audience, stage, assumptions, or terminology changes — never for implementation summaries, change history, or general programming terms.
- Before non-mechanical edits to `CONTEXT.md` or the project-local `AGENTS.md`, batch the proposed changes into one confirmation, unless the user explicitly requested them in the current conversation. Prefer the harness's structured question tool; ask with a concise message only when the tool is unavailable or nuanced feedback is needed.

### Boundaries

Only update durable docs/guidance. Do not change code, tracked state, archives, or commits. Do not add docs just to summarize the implementation. Workflow artifacts belong in `agent-work/`; `docs/` is for durable documentation.

### Output

Before a successful report, call `set_workflow_activity` with `reflection-complete` when available. Report one of:

- `READY FOR COMMIT` — include a `Summary:` line with 1-2 sentences on docs/guidance updated before the handoff label, then list docs updated
- `NO REFLECTION UPDATES — READY FOR COMMIT` — include a `Summary:` line with 1-2 sentences explaining why no durable updates were needed before the handoff label
- `REFLECTION BLOCKED` — explain the decision needed
