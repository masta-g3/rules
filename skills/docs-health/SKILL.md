---
name: docs-health
description: Assess durable documentation health, propose focused fixes, implement on confirmation.
metadata:
  thinkingLevel: high
---

Assess durable documentation health and propose focused edits that would help future readers act correctly.

### 1. Survey Documentation

Identify durable docs to audit:

- `README.md`
- root `CONTEXT.md` when present
- project-local `AGENTS.md` or `CLAUDE.md` when present
- `docs/**/*.md`
- other clearly durable user, operator, or developer Markdown files

Exclude as primary docs:

- `agent-work/` plans, history, tickets, scratchpads, logs, and validation artifacts
- generated output, vendored docs, dependency directories, and build artifacts
- temporary notes or implementation summaries

If an expected durable doc is missing, note it only when future readers would act differently if it existed.

### 2. Evaluate Health

Check for problems that affect future behavior:

- **Freshness**: stale paths, commands, architecture, feature descriptions, or workflow steps
- **Clarity**: vague guidance, hidden assumptions, missing audience, or unactionable prose
- **Organization**: important docs hard to find, misplaced content, or unclear ownership between files
- **Duplicated truth**: repeated guidance that can drift or already conflicts
- **Terminology drift**: terms that conflict with `CONTEXT.md` or surrounding docs
- **Over-documentation**: low-signal sections, implementation history, exhaustive lists, or docs that restate obvious code
- **Links and paths**: broken or suspicious internal references when practical to verify

Prefer deletion, tightening, or moving content before adding new documentation.

### 3. Report to User

Present a concise assessment before editing:

```md
## Docs Health

**Scope**: [files/areas audited]
**Overall**: [healthy / needs focused cleanup / stale]

### Suggested Fixes

1. **[file/section]** — [problem and why it matters]
   → Fix: [specific deletion, tightening, move, or addition]

2. **[file/section]** — [problem and why it matters]
   → Fix: [specific deletion, tightening, move, or addition]

### Minimal Gap Analysis

- [missing durable doc or section only if future readers would act differently]

### Not Worth Documenting

- [area]: [why documenting it would add noise or duplicate code]

Ready to implement? Confirm and I'll apply the focused edits.
```

Keep suggested fixes focused: 3-7 high-value items, not exhaustive coverage. If documentation is healthy, say so and recommend no edits.

### 4. Implement on Confirmation

Once the user confirms:

- Apply only the focused edits the user accepted.
- Preserve current-state documentation; do not add change history unless it affects a public contract or operator action.
- Prefer small replacements over appending new sections.
- Keep examples realistic and remove stale duplicates instead of creating parallel explanations.
- For non-trivial durable documentation edits, invoke the `docs-critic` subagent once after editing. Fix only clear issues; deletion is acceptable when the critique shows an edit is not worth keeping.
- Run relevant validation: path/link checks with `rg` or `find`, existing tests when docs affect tested inventories, and a final residue check for unfinished markers or prompt artifacts.

Do not audit for completeness as an end in itself. The goal is healthier durable documentation with less noise.
