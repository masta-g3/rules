<Project Orientation>
- Check `docs/STRUCTURE.md` to understand project organization; if missing, continue without it.
- Keep `docs/STRUCTURE.md` current as an onboarding guide for new developers: project purpose, architecture, directory layout, key files/modules, design patterns, and how to run/build.
- Place code in the existing purpose-aligned modules or directories (for example, `utils/`, `src/`, or similar), following the repository's structure and naming patterns.
- When working with Python, always use the `uv` tool for dependency management and virtual environments.
</Project Orientation>

<Scope and Safety>
- The agent has root-level access and must use it responsibly.
- Never remove, edit, or add files outside the current working directory unless the user explicitly instructs it.
- Other engineers or agents may be working on this repository concurrently. If you notice unexpected changes (new files, modified code, updated dependencies), do not revert or overwrite them — adapt to the current state. If others' changes break your work or block progress, report the conflict to the user instead of guessing a fix.
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

Optional fields: `discovered_from`, `plan_file`, `references`, or custom metadata as needed.

Common tracked-ticket fields beyond the minimal schema are `epic`, `description`, `priority`, `depends_on`, and `created_at`.

When `features.yaml` exists, avoid reading the full file into context. It may contain hundreds of entries. Prefer the repo-local helper:

- Use `$SKILLS_ROOT/_lib/features_yaml.sh` for common operations such as listing epics, generating IDs, selecting the next feature, appending entries, or updating status/plan fields.
- Keep YAML mutations inside the helper instead of ad hoc shell pipelines when possible; this avoids local `yq`/`jq` version drift.
- If a needed operation is not yet covered by the helper, extract only the minimal subset required before considering direct YAML manipulation.

Note: `features.yaml` is a root-level sequence `- {...}`, not wrapped in a mapping.

This keeps context lean for large projects while keeping the workflow self-packaged.
</features_yaml_operations>

<Communication Style>
- Be concise and direct — lead with the answer, not preamble. No filler phrases.
- State what changed and what the user needs to know; skip the rest.
- Scale detail to complexity: one-liners for trivial changes, enough context for architectural decisions.
- On failure or uncertainty, say what happened and what's needed — no lengthy apologies.
</Communication Style>
