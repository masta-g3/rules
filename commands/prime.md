---
description: Context prime the model by reading files relevant to a task.
model: claude-haiku-4-5
disable-model-invocation: false
---

Update the terminal title to reflect the current task — "Topic" is a short (2-4 word) description derived from `$1`. On Codex (`$CODEX_TTY` set): `printf '\033]0;%s\007' "⚡︎ Topic" > "$CODEX_TTY"`. Otherwise: `printf '\033]0;⚡︎ Topic\007'`.

Read and thoroughly understand this codebase by examining `docs/STRUCTURE.md` (and relevant documentation files), understanding its purpose, architecture, components, and coding/design philosophy.

Check recent git history (`git log --oneline -10`) for context on recent work.

We will be working on the following task: "$1", so pay particular attention to sections that relate to this topic. Read relevant scripts and files to gather sufficient context about existing patterns, components, design and implementation approaches. Once you have a comprehensive understanding, prepare to discuss.


---
## Autopilot State Transition

If `.claude/workflow.json` exists (autopilot is active), advance the workflow:
```bash
jq '.next = "/plan-md"' .claude/workflow.json > tmp.$$ && mv -f tmp.$$ .claude/workflow.json
```