---
name: reflect
description: Reflect on reviewed work and update durable docs or agent guidance before commit.
---

Update durable documentation and agent guidance after implementation has passed review, so docs describe the final reviewed result.

### Process

1. Inspect the active plan, review output, the conversation with the user, `git status --short`, and changed files.
2. Identify durable documentation needs by asking: who would act differently because of this?
   - users/operators → `README.md`
   - human developers learning architecture/layout/core patterns → `docs/STRUCTURE.md`
   - product/API/design truth → the relevant domain doc
   - recurring agent mistakes, user corrections, review findings, or counterintuitive workflow pitfalls → the project-local `AGENTS.md`
3. If a learning fits both a domain doc and `AGENTS.md`, put the full truth in the domain doc and only add a short `AGENTS.md` pointer/pitfall if agents are likely to miss it.
4. Do not duplicate existing docs. Add only the delta: new truth, stale truth correction, or a sharper operational rule agents are likely to miss.
5. Keep updates concise and factual. Prefer editing, replacing, or deleting stale text over appending; do not grow docs unless the new guidance will change future behavior.
6. Edit `AGENTS.md` rarely — only for rules whose absence would predictably send future agents into dead ends or repeated mistakes; otherwise it bloats and gets ignored.
7. If no durable update is needed, make no edits.

### Boundaries

Only update durable docs/guidance. Do not change code, tracked state, archives, or commits. Do not add docs just to summarize the implementation.

### Output

Report one of:

- `READY FOR COMMIT` — list docs updated
- `NO REFLECTION UPDATES — READY FOR COMMIT`
- `REFLECTION BLOCKED` — explain the decision needed
