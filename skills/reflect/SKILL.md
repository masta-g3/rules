---
name: reflect
description: Reflect on reviewed work and update durable docs or agent guidance before commit.
---

After implementation passes review, triage session friction. Correct misleading guidance or propose follow-up work in the owning code or interface. Do not turn every finding into a new instruction.

Only start reflection when authorized by the user. Reading this skill does not authorize work.

### Runtime integration

#### Pi

When the tools are available:
- Before starting, call `set_workflow_step` with `stepId: "reflect"`. Changing the indicator does not authorize additional work.
- The initial activity is `reviewing-guidance`; do not duplicate that signal.
- Call `set_workflow_activity` with `updating-guidance` before substantive edits, not minor fixes to typos, links, paths, or formatting.
- Before a successful report, call `set_workflow_activity` with `reflection-complete`.

### Process

Review only docs and sections related to the current work. If reading the relevant code answers the question, do not document it. Keep only durable general guidance that changes future decisions. Before adding text, remove duplicates and delete or rewrite outdated or overly specific guidance. Leave out temporary status, pending work, session history, and implementation details.

1. Read the active plan, including `Reflection Candidates`, review output, user conversation, and session logs.
2. Review the findings for friction, mistakes, and wrong assumptions. Distinguish guidance problems from code or interface problems. Propose the smallest correction at the source. If no useful correction is warranted, take no action. Route guidance proposals to the owning file:
   - project purpose, target user, project type, project stage, operating assumptions, or shared terminology → `CONTEXT.md`
   - user or operator instructions → `README.md`
   - external constraints or decision rationale absent from code → the relevant domain doc
   - durable project-wide execution rules with no better home → the project-local `AGENTS.md`. Normally leave it unchanged; recurrence alone does not justify a rule.
   - repeatable project workflows already defined in local skills or agent configuration → the owning file. Do not create skills or change user-global configuration unless explicitly requested.
3. Apply guidance changes under the approval rules below. For substantive guidance edits, invoke the `docs-critic` subagent afterward. Skip the critic for no guidance edits or minor fixes to typos, links, paths, or formatting. Follow the critic rule in `AGENTS.md`. Delete an update if the critique shows it is not worth keeping. Use the same approval rules for critic-driven changes.

### Follow-up work

- For clear code or interface problems worth fixing, check for an existing matching ticket before proposing a new one. Do not implement the fix during reflection.
- Ask before creating or updating follow-up tickets. Use the existing ticket helpers and conventions.
- Use the existing ticket conventions to record the problem, impact, evidence, and source-plan link (if available). Do not add new tracking fields or require a separate notes file. For an existing ticket, add only new evidence or a distinct occurrence; do not count the same incident twice.
- Mark each reflection candidate as resolved, linked to a follow-up ticket, or no action with a brief reason. Record outcomes, including declined follow-ups, in the active plan; if no plan exists, report them at handoff instead of creating a separate log.

### Editing rules

- Add only what will change future behavior. Revise or delete stale text before appending. Do not repeat what a doc already says.
- Describe current state, not history. Include migration, compatibility, or "previously..." notes only when a public contract or operator action depends on them.
- If guidance fits both a domain doc and `AGENTS.md`, put the details in the domain doc. Add a short pointer in `AGENTS.md` only if agents are likely to miss it.
- Keep project-local `AGENTS.md` focused on task execution, not session memory. Remove code-inferable guidance rather than moving it to another doc.
- Update `CONTEXT.md` only when project meaning, audience, stage, assumptions, or terminology changes. Do not add implementation summaries, change history, or general programming terms.
- Fix typos, links, paths, formatting, and factual errors in existing docs without asking. Verify facts against reviewed code.
- Use the structured question tool before changing rules, workflows, project purpose, or promises to users—or when unsure. Show the file, why it needs changing, proposed text, and practical effect. Summarize long edits as before/after. Apply only approved changes.

### Boundaries

Update durable docs and agent guidance, record candidate outcomes in the active plan, and create or update approved follow-up tickets. Do not change code, current-task status, archives, or commits. Do not add docs just to summarize the implementation. Keep workflow artifacts in `agent-work/` and durable documentation in `docs/`.

### Output

Include follow-up tickets created or updated, if any. If only follow-up tracking changed, use `READY FOR COMMIT` and summarize that outcome.

Report one of:

- `READY FOR COMMIT`. Before the label, include a `Summary:` line with 1-2 sentences describing the updates. After the label, list the docs changed.
- `NO REFLECTION UPDATES — READY FOR COMMIT`. Before the label, include a `Summary:` line with 1-2 sentences explaining why no durable updates were needed.
- `REFLECTION BLOCKED`. Explain the decision needed.
