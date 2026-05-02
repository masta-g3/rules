## Communication Style

**Lead with the answer.** No preamble, no filler, no apologies.
- One-liners for simple replies; expand only when complexity demands it.
- On failure or uncertainty: state what happened and what's needed.
- For complex ideas, prefer tables, lists, or ASCII diagrams over prose.
- When a request is ambiguous, use the ask-user tool instead of guessing.

## Project Orientation

- Check `docs/STRUCTURE.md` to understand project organization; if missing, continue without it.
- Keep `docs/STRUCTURE.md` current as an onboarding guide for new developers: project purpose, architecture, directory layout, key files/modules, design patterns, and how to run/build. Describe components and areas, not every file — it is a practical guide, not a full file index.
- Before adding code, inspect existing structure and place new code in the matching purpose-aligned module, following the repo's conventions.
- When working with Python, always use the `uv` tool for dependency management and virtual environments.

## Collaboration and Codebase Workflow

- Other engineers or agents may be working on this repository concurrently. If you notice unexpected changes (new files, modified code, updated dependencies), do not revert or overwrite them — adapt to the current state. If others' changes break your work or block progress, report the conflict to the user instead of guessing a fix.

## Implementation Principles

We are working at a lean startup, not a large corporation. Code accordingly:
- Prioritize minimalism and clarity. Removing is better than adding, **simple better than complex**.
- Unless the repo style dictates it, prefer a minimalistic functional programing approach over complex over-abstracted OOP.
- Avoid enterprise bloat, boilerplate, thin wrappers, unnecessary abstractions, ad-hoc patches, and hacky solutions.
- If an approach is not working, report and brainstorm with the user instead of forcing a brittle implementation.
- Do not introduce new patterns or technologies unless strictly needed.
- Study existing functions and patterns first; make minimal, non-disruptive changes that simplify the codebase.
- Check for existing similar code to avoid duplication.
- Keep components modular and reusable, but do not over-abstract.
- Keep function names direct and simple; avoid names like `enhanced` or `new`.
- Comment only non-obvious logic; avoid changelog-style comments.
- Centralize imports at the top of the script where that is best practice (e.g., Python).
- Skip redundant validations unless failure has real consequences.
- Let errors surface naturally. Avoid blanket `try/except`, especially `pass`.
- Avoid fallback mechanisms, mock data, default values, or backward compatibility layers unless explicitly requested.

## Generating Documentation

- When the user asks for a Markdown file (e.g., `FEATURE.md`), create detailed documentation that enables any engineer to implement independently:
  - Leverage Markdown elements and visual diagrams, preferably Mermaid.
  - Document why decisions were made, including trade-offs, constraints, and strategic context.
  - Include real code snippets, usage patterns, and concrete examples.
  - Keep examples realistic and working.
  - Write for maintainers six months later.
  - Place docs close to the code and maintain consistent terminology.
  - Document major features, complex algorithms, integration points, and performance-critical paths.

## Testing

- Follow **Test Driven Development**: write tests first, iterate until passing.
- Use ephemeral tests to validate features; remove all temporary test code and artifacts when done.

## Tracked Work State

Tracked work persists across sessions in three places:

- `features.yaml` — backlog and source of truth: id, status, priority, dependencies, and `plan_file`.
- `docs/plans/` — active implementation plans (created by `plan-md`, updated during `execute`).
- `docs/history/` — archived completed plans (moved here by `commit`; `plan_file` is updated to the archived path).

User-driven skill workflow (do not advance automatically; stay within the current step):
`next-feature` → `prime` → `plan-md` → `execute` → `review` → `reflect` → `commit`

### features.yaml schema

Root-level sequence (not wrapped in a mapping):

```yaml
- id: auth-001
  status: pending  # pending | in_progress | done | abandoned | superseded
  description: "..."
  priority: 1
  depends_on: []
  created_at: 2024-01-15
  completed_at: null  # set on terminal status
  # optional: discovered_from, plan_file, references, epic, or custom metadata
```

### Mutating features.yaml

When `features.yaml` exists, avoid reading the full file into context. Use `$SKILLS_ROOT/_lib/features_yaml.sh` for listing epics, generating IDs, selecting the next feature, appending entries, and updating status/plan fields. Only fall back to direct YAML edits for operations the helper does not yet cover.

## Skill Helper Setup

Before running skill helper commands, set `SKILLS_ROOT` from the active harness install path1:

- Codex: `export SKILLS_ROOT="$HOME/.codex/skills"`
- Claude: `export SKILLS_ROOT="$HOME/.claude/skills"`
- Cursor: `export SKILLS_ROOT="$HOME/.cursor/skills"`
- Pi: `export SKILLS_ROOT="$HOME/.pi/agent/skills"`
