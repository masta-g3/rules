---
name: prime
description: Context priming by reading files relevant to a task.
argument-hint: "[task]"
---

Orient on the task with the minimum context needed to work confidently:

1. Read `docs/STRUCTURE.md` and relevant `docs/` for repo architecture and conventions.
2. Check recent git history (`git log --oneline -10`) and `docs/history` for recent context.
3. If ambiguities remain after steps 1-2, interview the user (use the user ask tool if available) — walk through each decision branch one at a time until scope, approach, and dependencies are jointly understood. Don't carry unresolved assumptions forward.
4. Produce a brief synthesis: files to touch, patterns to follow, and risks.

For broad tasks, launch 1-3 parallel read-only subagents to scout distinct areas.