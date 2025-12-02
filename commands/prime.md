---
description: Context prime the model by reading files relevant to a task.
model: claude-haiku-4-5
---

Read and thoroughly understand this codebase by examining `docs/STRUCTURE.md` (or similar documentation files), understanding its purpose, architecture, components, and coding/design philosophy.

Check recent git history (`git log --oneline -10`) for context on recent work.

We will be working on the following task: "$1", so pay particular attention to sections that relate to this topic. Read relevant scripts and files to gather sufficient context about existing patterns, components, design and implementation approaches. Once you have a comprehensive understanding, prepare to discuss.

---
If `.claude/workflow.json` exists, update it: `jq '.next = "/plan-md"' .claude/workflow.json > tmp.$$ && mv -f tmp.$$ .claude/workflow.json`