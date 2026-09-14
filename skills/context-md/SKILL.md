---
name: context-md
description: Interview the user to establish project context. Write root CONTEXT.md for initial setup or a major rethink.
argument-hint: "[optional focus]"
---

Create or update only root `CONTEXT.md`. Do not scaffold projects, create tickets, or edit other docs.

### 1. Investigate

Inspect relevant docs and code. Find facts yourself; ask about intent and decisions. Treat inferred purpose, audience, and stage as assumptions.

For new projects without code, use the user's description and session context instead of repo exploration.

### 2. Summarize

Briefly state your understanding, uncertainties, and proposed changes to the existing framing. Label assumptions.

### 3. Confirm understanding

Use the ask-user tool to check your framing:

- **Mostly right**: clarify missing, uncertain, or high-impact details.
- **Partly wrong**: resolve the core misunderstanding first.
- **Mostly wrong**: restart from purpose, user, stage, success, and language.

Do not write `CONTEXT.md` until the user confirms the framing.

### 4. Interview

Ask one decision question at a time, with a recommendation and brief rationale. Resolve dependent decisions in order; wait for each answer.

Ask only unresolved questions. Skip confirmed topics. Stop when context is clear, not when every topic has been covered.

### 5. Write CONTEXT.md

Include only useful sections:

- Purpose
- Target user
- Project type
- Project stage
- Success criteria
- Operating assumptions
- Out of scope
- Language: project-specific terms, definitions, and synonyms to avoid when useful

Prefer precise edits over rewrites. Keep good content; remove stale context, generic definitions, and text that merely repeats code. Do not duplicate `README.md` or `docs/STRUCTURE.md`.

Exclude implementation history, temporary notes, file indexes, and architecture details.

### Output

Report the `CONTEXT.md` path and a `Summary:` line describing what you created or changed.
