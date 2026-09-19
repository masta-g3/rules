---
name: reflect
description: Reflect on reviewed work and update durable docs or agent guidance before commit.
---

After implementation passes review, identify session friction and propose guidance changes to prevent it from recurring.

When available, call `set_workflow_step` with `stepId: "reflect"` before starting this authorized step. Reading this skill alone does not update the indicator. Changing steps does not authorize additional work.

### Process

The step starts with `reviewing-guidance` as its default activity.

Review only docs and sections related to the current work. If reading the relevant code answers the question, do not document it. Keep only durable guidance that changes future decisions. Before adding text, remove duplicates and delete or rewrite outdated or overly specific guidance. Leave out temporary status, pending work, session history, and implementation details.

1. Read the active plan, review output, user conversation, and session logs.
2. Review the session for friction, mistakes, and wrong assumptions. Identify what missing or misleading guidance caused them. Propose the smallest correction that would prevent recurrence, including removing confusing guidance. If no durable correction is useful, change nothing. Route proposals to the owning file:
   - project purpose, target user, project type, project stage, operating assumptions, or shared terminology → `CONTEXT.md`
   - user or operator instructions → `README.md`
   - external constraints or decision rationale absent from code → the relevant domain doc
   - recurring agent mistakes, user corrections, review findings, or unexpected workflow pitfalls → the project-local `AGENTS.md`
   - repeatable project workflows already defined in local skills or agent configuration → the owning file. Do not create skills or change user-global configuration unless explicitly requested.
3. Apply changes under the approval rules below. For substantive edits, call `updating-guidance` when available before editing. Then invoke the `docs-critic` subagent. Skip both for no edits or minor fixes to typos, links, paths, or formatting. Follow the critic rule in `AGENTS.md`. Delete an update if the critique shows it is not worth keeping. Use the same approval rules for critic-driven changes.

### Editing rules

- Add only what will change future behavior. Revise or delete stale text before appending. Do not repeat what a doc already says.
- Describe current state, not history. Include migration, compatibility, or "previously..." notes only when a public contract or operator action depends on them.
- If guidance fits both a domain doc and `AGENTS.md`, put the details in the domain doc. Add a short pointer in `AGENTS.md` only if agents are likely to miss it.
- Keep project-local `AGENTS.md` focused on task execution, not session memory. Remove code-inferable guidance rather than moving it to another doc.
- Update `CONTEXT.md` only when project meaning, audience, stage, assumptions, or terminology changes. Do not add implementation summaries, change history, or general programming terms.
- Fix typos, links, paths, formatting, and factual errors in existing docs without asking. Verify facts against reviewed code.
- Use the structured question tool before changing rules, workflows, project purpose, or promises to users—or when unsure. Show the file, why it needs changing, proposed text, and practical effect. Summarize long edits as before/after. Apply only approved changes.

### Boundaries

Update only durable docs and agent guidance. Do not change code, tracked state, archives, or commits. Do not add docs just to summarize the implementation. Keep workflow artifacts in `agent-work/` and durable documentation in `docs/`.

### Output

Before a successful report, call `set_workflow_activity` with `reflection-complete` when available. Report one of:

- `READY FOR COMMIT`. Before the label, include a `Summary:` line with 1-2 sentences describing the updates. After the label, list the docs changed.
- `NO REFLECTION UPDATES — READY FOR COMMIT`. Before the label, include a `Summary:` line with 1-2 sentences explaining why no durable updates were needed.
- `REFLECTION BLOCKED`. Explain the decision needed.
