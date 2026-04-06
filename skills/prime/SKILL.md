---
name: prime
description: Context prime the model by reading files relevant to a task.
argument-hint: "[task]"
---

Assume `SKILLS_ROOT` is set per `AGENTS.md` before running helper commands.

Orient on the task with the minimum context needed to work confidently.

1. Read `docs/STRUCTURE.md` first, plus other relevant `docs/` files when they help clarify the task, architecture, or local conventions.
2. Check recent git history (`git log --oneline -10`) for context that may affect the task.
3. Read the task-relevant source files and a small number of nearby reference files that show the patterns to follow.

For broad or cross-cutting tasks, you may launch 1-3 parallel read-only subagents to scout distinct areas. Skip this for simple local tasks.

Then produce a brief synthesis for the next step:
- files/modules to inspect or modify
- existing patterns to follow
- relevant risks or recent changes
- open ambiguities to resolve before planning or implementation
