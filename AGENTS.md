## Communication Style

**Keep responses short.** Lead with the answer, not preamble. No filler, no fluff.
- State what changed and what the user needs to know; skip the rest.
- Use one-liners for simple replies; expand only as needed for complexity.
- On failure or uncertainty, say what happened and what's needed — no apologies.
- Use the user ask tool to interview the user when requests are ambiguous or under-specified.
- When explaining complex ideas prefer structured elements or ASCII diagrams.

## Project Orientation

- Check `docs/STRUCTURE.md` to understand project organization; if missing, continue without it.
- Keep `docs/STRUCTURE.md` current as an onboarding guide for new developers: project purpose, architecture, directory layout, key files/modules, design patterns, and how to run/build.
- Place code in the existing purpose-aligned modules or directories (for example, `utils/`, `src/`, or similar), following the repository's structure and naming patterns.
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

## Features YAML Operations

`features.yaml` is a project backlog file tracking features through the development cycle. Minimal schema (root-level sequence, not wrapped in a mapping):

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

## Skills Root

Before running skill helper commands, set `SKILLS_ROOT` from the active harness install path. `./sync-prompts.sh` populates each harness skill root directly:

- Codex: `export SKILLS_ROOT="$HOME/.codex/skills"`
- Claude: `export SKILLS_ROOT="$HOME/.claude/skills"`
- Cursor: `export SKILLS_ROOT="$HOME/.cursor/skills"`
- Pi: `export SKILLS_ROOT="$HOME/.pi/agent/skills"`

When `features.yaml` exists, avoid reading the full file into context. Prefer the repo-local helper:

- Use `$SKILLS_ROOT/_lib/features_yaml.sh` for common operations such as listing epics, generating IDs, selecting the next feature, appending entries, or updating status/plan fields.
- Keep YAML mutations inside the helper instead of ad hoc shell pipelines when possible; this avoids local `yq`/`jq` version drift.
- If a needed operation is not yet covered by the helper, extract only the minimal subset required before considering direct YAML manipulation.

User-driven skill workflow (do not advance automatically; stay within the current step):
`next-feature` → `prime` → `plan-md` → `execute` → `review` → `commit`