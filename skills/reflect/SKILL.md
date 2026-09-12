---
name: reflect
description: Reflect on reviewed work and update durable docs or agent guidance before commit.
---

After implementation passes review, update durable docs and agent guidance to match the reviewed result.

### Process

The step starts with `reviewing-guidance` as its default activity.

Review only docs and sections related to the current work. Keep guidance only if it changes future decisions, remains useful, and cannot be inferred from the code. Before adding text, remove duplicates and delete or rewrite outdated or overly specific guidance. Leave out temporary status, pending work, session history, and implementation details.

1. Read the active plan, review output, user conversation, and session logs.
2. Find missing context that could lead users, maintainers, or agents to make wrong decisions. Prioritize gaps by who would act differently with that context. Update the file that owns it:
   - project purpose, target user, project type, project stage, operating assumptions, or shared terminology → `CONTEXT.md`
   - user or operator instructions → `README.md`
   - architecture, layout, or core patterns for developers → `docs/STRUCTURE.md`
   - product behavior, API contracts, or design decisions → the relevant domain doc
   - recurring agent mistakes, user corrections, review findings, or unexpected workflow pitfalls → the project-local `AGENTS.md`
   - repeatable project workflows already defined in local skills or agent configuration → the owning file. Do not create skills or change user-global configuration unless explicitly requested.
3. For substantive edits, call `updating-guidance` when available before editing. Then invoke the `docs-critic` subagent. Skip both for no edits or minor fixes to typos, links, paths, or formatting. Follow the critic rule in `AGENTS.md`. Delete an update if the critique shows it is not worth keeping.

### Editing rules

- Add only what will change future behavior. Revise or delete stale text before appending. Do not repeat what a doc already says.
- Describe current state, not history. Include migration, compatibility, or "previously..." notes only when a public contract or operator action depends on them.
- If guidance fits both a domain doc and `AGENTS.md`, put the details in the domain doc. Add a short pointer in `AGENTS.md` only if agents are likely to miss it.
- Keep project-local `AGENTS.md` focused on task execution, not session memory. Before adding a rule, edit, merge, shorten, delete, or move existing guidance to `docs/STRUCTURE.md` as appropriate.
- Update `CONTEXT.md` only when project meaning, audience, stage, assumptions, or terminology changes. Do not add implementation summaries, change history, or general programming terms.
- Before substantive edits to `CONTEXT.md` or project-local `AGENTS.md`, ask for confirmation of all proposed changes together. Skip confirmation only if the user explicitly requested those changes in the current conversation. Use the harness's structured question tool. Use a concise message only if the tool is unavailable or the question needs nuanced feedback.

### Boundaries

Update only durable docs and agent guidance. Do not change code, tracked state, archives, or commits. Do not add docs just to summarize the implementation. Keep workflow artifacts in `agent-work/` and durable documentation in `docs/`.

### Output

Before a successful report, call `set_workflow_activity` with `reflection-complete` when available. Report one of:

- `READY FOR COMMIT`. Before the label, include a `Summary:` line with 1-2 sentences describing the updates. After the label, list the docs changed.
- `NO REFLECTION UPDATES — READY FOR COMMIT`. Before the label, include a `Summary:` line with 1-2 sentences explaining why no durable updates were needed.
- `REFLECTION BLOCKED`. Explain the decision needed.
