---
name: prime
description: Context prime the model by reading files relevant to a task.
argument-hint: "[task]"
---

Set `$SKILLS_ROOT` to your harness skills path before helper commands: `~/.codex/skills` (Codex), `~/.claude/skills` (Claude), `~/.cursor/skills` (Cursor), `~/.pi/agent/skills` (Pi).

Read and thoroughly understand this codebase by examining `docs/STRUCTURE.md` (and relevant `docs/` files), understanding its purpose, architecture, components, and coding/design philosophy.

Check recent git history (`git log --oneline -10`) for context on recent work.

We will be working on the following task: "$1", so pay particular attention to sections that relate to this topic. Read relevant scripts and files to gather sufficient context about existing patterns, components, design and implementation approaches. Once you have a comprehensive understanding, prepare to discuss.
