---
name: prime
description: Context priming to prepare to execute a task.
argument-hint: "[task]"
---

Gather the context needed to work confidently on the task:

1. Read `docs/STRUCTURE.md` and relevant durable `docs/` for repo architecture and conventions.
2. Check recent git history (`git log --oneline -10`) and `agent-work/history` for recent workflow context.
3. Investigate the relevant code: locate the modules involved, read the key files, and trace call sites. When the task touches multiple areas of the codebase, launch 1-3 parallel read-only subagents to scout distinct areas — prefer `scout` if available; otherwise use a general or best-fit agent.
4. Produce a brief synthesis: files to touch, patterns to follow, and risks.

### Output

For successful priming, include a `Summary:` line with 1-2 sentences on the key context learned, then end with `READY FOR PLAN`. If context gathering is blocked, report `BLOCKED — <reason>`.
