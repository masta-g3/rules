---
name: reflect
description: Reflect on reviewed work and update durable docs or agent guidance before commit.
metadata:
  thinkingLevel: medium
---

Update durable documentation and agent guidance after implementation has passed review, so docs describe the final reviewed result.

### Process

1. Inspect the active plan, review output, the conversation with the user, `git status --short`, and changed files.
2. Identify durable documentation needs by asking: who would act differently because of this?
   - project purpose, target user, project type, project stage, operating assumptions, or shared terminology → `CONTEXT.md`
   - users/operators → `README.md`
   - human developers learning architecture/layout/core patterns → `docs/STRUCTURE.md`
   - product/API/design truth → the relevant domain doc
   - recurring agent mistakes, user corrections, review findings, or counterintuitive workflow pitfalls → the project-local `AGENTS.md`
3. If a learning fits both a domain doc and `AGENTS.md`, put the full truth in the domain doc and only add a short `AGENTS.md` pointer/pitfall if agents are likely to miss it.
4. Do not duplicate existing docs. Add only the delta: new truth, stale truth correction, or a sharper operational rule agents are likely to miss.
5. Keep updates concise and factual. Prefer editing, replacing, or deleting stale text over appending; do not grow docs unless the new guidance will change future behavior.
6. Update `CONTEXT.md` only when project meaning, audience, stage, assumptions, or terminology changes; do not add implementation summaries, change history, or general programming terms.
7. Docs should describe the current state of the product/system, not the history of how it changed; avoid backward-compatibility, migration, or "previously..." notes unless they affect a real public contract or operator action.
8. For non-trivial durable doc/guidance edits, invoke the `docs-critic` subagent once to check clarity, fit, and whether the additions are truly durable. Skip when there are no edits or only tiny mechanical fixes such as typos, links, paths, or formatting. Fix only clear issues; deletion is acceptable when the critique shows the update is not worth keeping.
9. Edit `AGENTS.md` sparingly — add only rules whose absence would cause dead ends or repeated mistakes; trim ones that have become too specific, stale, or low-signal.
10. If no durable update is needed, make no edits.

### Boundaries

Only update durable docs/guidance. Do not change code, tracked state, archives, or commits. Do not add docs just to summarize the implementation. Workflow artifacts belong in `agent-work/`; `docs/` is for durable documentation.

### Output

Report one of:

- `READY FOR COMMIT` — include a `Summary:` line with 1-2 sentences on docs/guidance updated before the handoff label, then list docs updated
- `NO REFLECTION UPDATES — READY FOR COMMIT` — include a `Summary:` line with 1-2 sentences explaining why no durable updates were needed before the handoff label
- `REFLECTION BLOCKED` — explain the decision needed
