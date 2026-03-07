<Project Orientation>
- Check `docs/STRUCTURE.md` to understand project organization.
- If `docs/STRUCTURE.md` is missing (for example, in a new project), continue without it.
- Keep `docs/STRUCTURE.md` current as an onboarding guide for new developers: project purpose, architecture, directory layout, key files/modules, design patterns, and how to run/build.
- Place code in the existing purpose-aligned modules or directories (for example, `utils/`, `src/`, or similar), following the repository's structure and naming patterns.
- When working with Python, always use the `uv` tool for dependency management and virtual environments.
</Project Orientation>

<Scope and Safety>
- The agent has root-level access and must use it responsibly.
- Never remove, edit, or add files outside the current working directory unless the user explicitly instructs it.
</Scope and Safety>

<Implementation Principles>
We are working at a lean startup, maintained by a small team of 10x engineers, not a large corporation. Code accordingly:
- Prioritize minimalism: clean, readable, lightweight, modular code. Less is more; elegance is clarity.
- Avoid enterprise bloat, useless boilerplate, thin wrappers, ad-hoc patches, and hacky solutions.
- If an approach is not working, brainstorm alternatives with the user instead of forcing a brittle implementation.
- Do not introduce new patterns or technologies unless they are strictly needed.
- Study existing functions and patterns first; follow the established style and leave the codebase simpler and more organized.
- Make minimal, non-disruptive changes that fit the current structure.
- Check for existing similar code to avoid duplication.
- Keep components modular and reusable.
- Follow existing styles and patterns.
- Keep function names direct and simple; avoid names like `enhanced` or `new`.
- Avoid unnecessary changelog-style comments such as "new feature" indicators.
- Comment only non-obvious logic.
- Centralize imports at the top of the script in languages where that is best practice, such as Python.
- Skip redundant validations unless failure has real consequences.
- Let errors surface naturally. Avoid blanket `try/except`, especially `pass`; only use `try/except` for minor processing failures where handling is intentional.
- Avoid adding fallback mechanisms, mock data, or default values unless the user explicitly asks for them.
- Do not add backward compatibility layers or defaults unless the user explicitly requests them.
</Implementation Principles>

<Generating Documentation>
- When planning features, create detailed Markdown documentation that enables any engineer to implement independently.
- When the user asks for a Markdown file such as `FEATURE.md`, follow these rules:
  - Leverage Markdown elements and visual diagrams, preferably Mermaid.
  - Document why decisions were made, including trade-offs, constraints, and strategic context.
  - Include real code snippets, usage patterns, and concrete examples.
  - Keep examples realistic and working.
  - Write for maintainers six months later.
  - Place docs close to the code and maintain consistent terminology.
  - Document major features, complex algorithms, integration points, and performance-critical paths.
  - Avoid corporate bloat, overengineering, and useless boilerplate.
</Generating Documentation>

<Testing>
- Test functions without external effects when possible.
- If testing is impossible, validate correctness manually.
- Consider Test Driven Development for robust software development.
- Create ephemeral tests to validate features and implementations, iterate until they behave as expected, then remove those temporary tests.
</Testing>

<features_yaml_operations>
`features.yaml` is a project backlog file tracking features through the development cycle. Minimal schema:

```yaml
- id: auth-001
  status: pending  # pending | in_progress | done | abandoned | superseded
  description: "..."
  priority: 1
  depends_on: []
  created_at: 2024-01-15
  completed_at: null  # set on terminal status
```

Optional fields: `discovered_from`, `spec_file`, or custom metadata as needed.

When `features.yaml` exists, avoid reading the full file into context. It may contain hundreds of entries. Use `yq` for lightweight extraction:

- Extract specific fields, such as epic prefixes, status counts, or recent items by `created_at`.
- Filter to the relevant subset before reading details.
- Update in place with `yq -i` rather than read-modify-write in context.

Note: `features.yaml` is a root-level sequence `- {...}`, not wrapped in a mapping.

For in-place updates, use: `yq -i '.expression' features.yaml`

This keeps context lean for large projects.
</features_yaml_operations>
