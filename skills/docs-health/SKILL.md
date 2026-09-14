---
name: docs-health
description: Audit durable docs for cleanup and corrections. Apply approved changes.
---

Maintain durable docs without requiring a recent implementation session.

### 1. Survey docs

Audit `README.md`, root `CONTEXT.md`, project-local `AGENTS.md` or `CLAUDE.md`, `docs/**/*.md`, and other durable user, operator, or developer Markdown.

Exclude `agent-work/` artifacts, generated or vendored docs, dependencies, builds, temporary notes, and implementation summaries as primary docs.

Flag missing docs only when they would help readers act correctly.

### 2. Assess

Check claims against relevant code and commands. Find stale, misleading, duplicate, or unnecessary text.

- Propose deleting sections or files that no longer help readers.
- Keep purpose, constraints, rationale, and useful user instructions. Cut text that merely repeats code.
- Remove guidance that merely repeats code; do not move it elsewhere.
- Ask about unclear intent or terminology; never invent answers to make docs agree.
- Add only information that helps readers act correctly, not for completeness.

### 3. Propose edits

Say what you inspected. For each worthwhile edit, name the file or section, change, and reason.
Use the ask-user tool for approval before editing. If no changes are needed, say so without asking.

### 4. Apply approved edits

- Apply only accepted edits. Prefer small replacements over new sections.
- Describe current state. Include history only when it affects public contracts or operator actions.
- Keep examples realistic; remove stale duplicates instead of adding parallel explanations.
- After substantive edits, invoke `docs-critic` once. Follow the `AGENTS.md` critic rule; you may discard edits the critique shows are not useful.
- Check affected paths and links with `rg` or `find`. Run existing tests for affected inventories. Check for unfinished markers and prompt artifacts.

### Output

List changed files. Include a 1-2 sentence `Summary:` line covering fixes and what you deliberately left alone.
