<Codebase Structure>
- Check docs/STRUCTURE.md to understand project organization.
- If docs/STRUCTURE.md is missing (e.g., new project), just continue without it.
- Place functions in appropriate utils/, src/, etc. scripts by purpose (data_utils.py, format_utils.py, etc.).
- STRUCTURE.md should serve as an onboarding guide to new developers: project purpose, architecture, directory layout, key files/modules, design patterns, how to run/build. Keep it current.
- When working with python always use the `uv` tool for dependency management and virtual environments.
- IMPORTANT: it is UNACCEPTABLE to remove/edit/add files outside of the initial working directory.
</Codebase Structure>

<Coding Style>
- Prioritize minimalism: clean, readable, lightweight, modular code; avoid enterprise bloat at all costs.
- Never solve problems with hacks or hacky solutions; if an approach is not working, brainstorm alternatives with the user instead.
- Don't introduce new patterns/technologies unless strictly needed.
- Study existing functions to maintain consistent patterns and style.
- Avoid thin wrappers and ad-hoc patches.
- Make minimal, non-disruptive changes that follow existing structure.
- Check for existing similar code to avoid duplication.
- Keep function names direct and simple (no 'enhanced', 'new' prefixes).
- Avoid unecessary changelog style comments (or useless ones), such as 'new feature' indicators.
- Avoid try-except except for minor processing failures; we don't want processes to fail silently.
- Avoid adding fallback mechanism, mock data or default values unless the user explicitly asks.
- Centralize imports at script top (for languages like python, where this is best practice).
</Coding Style>

<Minimalist Coding Philosophy>
We are working at a lean startup, maintained by a small team of 10x engineers, not a large corporation. Code accordingly:
- Less is more, elegance is clarity
- Avoid useless boilerplate code, be minimal and efficient
- Make components modular and reusable
- Follow existing styles and patterns
- Leave codebase simpler and more organized
- Skip redundant validations unless failure has real consequences
- Let errors surface naturally; avoid blanket try/except (especially "pass") that hides bugs
- Avoid adding fallback mechanism or default values unless the user explicitly asks
- No backward compatibility or defaults unless requested
- Comment only non-obvious logic
</Minimalist Coding Philosophy>

<Generating Documentation>
- When planning features, create detailed markdown documentation that enables any engineer to implement independently.
- Adhere to the following style when the user asks you to generate a markdown file (e.g.: FEATURE.md):
    - Leverage markdown elements and visual diagrams (prefer Mermaid).
    - Document "why" behind decisions - trade-offs, constraints, strategic context.
    - Include real code snippits, usage patterns, concrete examples.
    - Keep examples realistic and working.
    - Write for maintainers 6 months later.
    - Place docs close to code, maintain consistent terminology.
    - Document major features, complex algorithms, integration points, performance-critical paths.
    - Avoid corporate bloat, overengineering or useless boilerplate.
</Generating Documentation>

<Testing>
- Test functions without external effects when possible; if testing is impossible, validate code correctness manually.
- Consider Test Driven Development for robust software development.
- Create ephemeral tests to validate features and implementations. Iterate until expected results, then remove temporary tests.
</Testing>

<Autopilot>
When a Stop hook blocks with reason starting with "AUTOPILOT:", execute the slash command specified.
Example: "AUTOPILOT: Run /prime auth-001" → immediately run /prime auth-001
</Autopilot>

<features_json_operations>
When `features.json` exists, avoid reading the full file into context—it may contain hundreds of entries. Use `jq` for lightweight extraction:

- Extract specific fields (epic prefixes, status counts, recent by created_at)
- Filter to relevant subset before reading details
- Update in-place with jq rather than read-modify-write in context

Note: features.json is a root-level array `[{...}, ...]`, not wrapped in an object.

For in-place updates, use: `jq '...' file.json > tmp.$$ && mv -f tmp.$$ file.json`

This keeps context lean for large projects.
</features_json_operations>
