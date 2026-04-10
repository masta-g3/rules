---
name: prime
description: Context prime the model by reading files relevant to a task.
argument-hint: "[task]"
---

Orient on the task with the minimum context needed to work confidently:

1. Read `docs/STRUCTURE.md` and relevant `docs/` for repo architecture and conventions.
2. Check recent git history (`git log --oneline -10`) and `docs/history` for recent context.
3. Produce a brief synthesis: files to touch, patterns to follow, risks, and open ambiguities.

For broad tasks, launch 1-3 parallel read-only subagents to scout distinct areas.