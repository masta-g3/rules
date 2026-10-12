# Doc routing

Put each piece of durable guidance in the file that owns it. When text is duplicated, keep the owner's copy and remove the others.

- project purpose, target user, project type, project stage, success criteria, operating assumptions, out-of-scope boundaries, or shared terminology → `CONTEXT.md`
- user or operator instructions → `README.md`
- non-obvious code locations, relationships, or placement boundaries → `docs/STRUCTURE.md`
- external constraints or decision rationale absent from code → the relevant domain doc
- durable project-wide execution rules with no better home → the project-local `AGENTS.md`. Normally leave it unchanged; recurrence alone does not justify a rule.
- repeatable project workflows already defined in local skills or agent configuration → the owning file. Do not create skills or change user-global configuration unless explicitly requested.
