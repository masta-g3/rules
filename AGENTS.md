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

<features_yaml_operations>
`features.yaml` is a project backlog file tracking features through the development cycle. Minimal schema:

```yaml
- id: auth-001
  status: pending  # pending | in_progress | done | abandoned | superseded
  description: "..."
  priority: 1
  depends_on: []
  created_at: 2024-01-15
```

Optional fields: `discovered_from`, `spec_file`, or custom metadata as needed.

When `features.yaml` exists, avoid reading the full file into context—it may contain hundreds of entries. Use `yq` for lightweight extraction:

- Extract specific fields (epic prefixes, status counts, recent by created_at)
- Filter to relevant subset before reading details
- Update in-place with `yq -i` rather than read-modify-write in context

Note: features.yaml is a root-level sequence `- {...}`, not wrapped in a mapping.

For in-place updates, use: `yq -i '.expression' features.yaml`

This keeps context lean for large projects.
</features_yaml_operations>

<file_reservations>
Cooperative file-lock for parallel agents. Presence-based toggle: if `docs/plans/.file-locks.json` exists, reservations are active.

Schema — top-level object, file path → reservation:
```json
{"src/auth/login.py": {"by": "auth-001", "at": "2026-01-30T10:30:00Z"}}
```

Before modifying any file, check if it's reserved by another feature:
```bash
LOCK_FILE="docs/plans/.file-locks.json"
HOLDER=$(jq -r --arg f "$FILE" --arg me "$FEATURE_ID" \
  '.[$f] // null | if . != null and .by != $me then .by else empty end' \
  "$LOCK_FILE")
```

If held: `sleep 15`, retry up to 5 times. If still held, report to user and pause.

Reserve before modifying, release after:
```bash
# reserve
jq --arg f "$FILE" --arg id "$FEATURE_ID" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '.[$f] = {"by": $id, "at": $ts}' "$LOCK_FILE" > tmp.$$ && mv -f tmp.$$ "$LOCK_FILE"
# release
jq --arg f "$FILE" 'del(.[$f])' "$LOCK_FILE" > tmp.$$ && mv -f tmp.$$ "$LOCK_FILE"
```

One file at a time. Derive feature ID from active plan file name (e.g., `auth-001.md` → `auth-001`).
</file_reservations>
