---
name: docs-health
description: Audit durable docs for cleanup and corrections. Apply approved changes.
---

Maintain durable docs without requiring a recent implementation session.

### 1. Survey docs

Audit the requested files or area. For a repo-wide audit, start with `README.md`, root `CONTEXT.md`, and project-local agent guidance, then durable docs under `docs/` or elsewhere. For large doc sets, audit the most-read docs first and report what you skipped.

Exclude `agent-work/` artifacts, generated or vendored docs, dependencies, builds, temporary notes, and implementation summaries as primary docs.

Flag missing docs only when they would help readers act correctly.

### 2. Assess

Check claims against relevant code and commands. Find stale, misleading, duplicate, or unnecessary text.

- Propose deleting sections or files that no longer help readers.
- Keep purpose, constraints, rationale, and useful user instructions.
- Remove guidance that merely repeats code; do not move it elsewhere.
- Move misplaced text and resolve duplicates per [doc routing](../_lib/doc-routing.md).
- Ask about unclear intent or terminology; never invent answers to make docs agree.
- Add only information that helps readers act correctly, not for completeness.

### 3. Propose edits

Fix typos, broken links, wrong paths, formatting, and factual errors verified against code without asking.

For deletions, rewrites, and changes to intent or instructions, say what you inspected. For each edit, name the file or section, change, and reason. Group related edits and use the ask-user tool to approve them in batches. If no such changes are needed, say so without asking.

### 4. Apply edits

- Apply the fixes from step 3 and accepted edits only. Prefer small replacements over new sections.
- Describe current state. Include history only when it affects public contracts or operator actions.
- Keep examples realistic; remove stale duplicates instead of adding parallel explanations.
- After substantive edits, invoke `docs-critic` once. Follow the `AGENTS.md` critic rule; you may discard edits the critique shows are not useful.
- Check affected paths and links with `rg` or `find`. If tests check the edited docs, such as file lists or skill tables, run them. Check for unfinished markers and prompt artifacts.

### Output

List changed files. Include a 1-2 sentence `Summary:` line covering fixes and what you deliberately left alone.
