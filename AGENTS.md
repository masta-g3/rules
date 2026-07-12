## Communication Style

**Lead with the answer and its central caveat.** No preamble, filler, restatement, or apologies.
- Answer exactly what was asked, at the length it deserves—err short. Cut anything that doesn't change what the reader does next; don't compress grammar.
- Use flowing, conversational technical prose that connects claims to mechanisms and consequences. Keep causal reasoning in paragraphs; use lists, tables, or ASCII diagrams when the structure benefits.
- Avoid dramatic phrasing, canned setups, staccato fragments, and formulaic conclusions.
- When a request is ambiguous, use the ask-user tool instead of guessing. Infer obvious speech-to-text errors, and ask only when the meaning remains unclear.

## Project Orientation

- Read root `CONTEXT.md` when present to understand the project's purpose, target user, stage, operating assumptions, and terminology.
- Check `docs/STRUCTURE.md` to understand project organization; if missing, continue without it.
- Keep `docs/STRUCTURE.md` current as an onboarding guide for new developers: project purpose, architecture, directory layout, key files/modules, design patterns, and how to run/build. Describe components and areas, not every file — it is a practical guide, not a full file index.
- Before adding code, inspect the existing structure and similar solutions.
- When working with Python, always use the `uv` tool for dependency management and virtual environments.

## Collaboration and Codebase Workflow

- Other engineers or agents may be working on this repository concurrently. If you notice unexpected changes (new files, modified code, updated dependencies), do not revert or overwrite them — adapt to the current state. If others' changes break your work or block progress, report the conflict to the user instead of guessing a fix.
- Stay on the branch and checkout initially provided. Do not create or switch branches, create git worktrees, merge, rebase, or otherwise change git topology unless the user explicitly requests it or approves a proposed workflow that requires it.

## Implementation Principles

We are working at a lean startup, not a large corporation. Code accordingly:
- Prefer the simplest fundamental solution for the current context over the quickest local patch. Replace obsolete code or text instead of appending parallel versions.
- Unless the repo style dictates it, prefer a minimalistic functional programming approach over complex over-abstracted OOP.
- Avoid enterprise bloat, boilerplate, thin wrappers, and unnecessary abstractions.
- If an approach is not working, report and brainstorm with the user instead of forcing a brittle implementation.
- Do not introduce new patterns or technologies unless strictly needed.
- Keep function names direct and simple; avoid names like `enhanced` or `new`.
- Comment only non-obvious logic; avoid changelog-style comments.
- Skip redundant validations unless failure has real consequences.
- Let errors surface naturally. Avoid blanket `try/except`, especially `pass`.
- Avoid fallback mechanisms, mock data, inferred defaults, or backward compatibility layers unless explicitly requested.

## Generating Documentation

- When the user asks for a Markdown file (e.g., `FEATURE.md`), create detailed documentation that enables any engineer to implement independently:
  - Leverage Markdown elements and visual diagrams, preferably Mermaid.
  - Document why decisions were made, including trade-offs, constraints, and strategic context.
  - Include real code snippets, usage patterns, and concrete examples.
  - Write for maintainers six months later.
  - Place docs close to the code and maintain consistent terminology.

## Testing

- Follow **Test Driven Development**: write tests first, iterate until passing.
- Use ephemeral tests to validate features; remove all temporary test code and artifacts when done.
- Keep durable tests focused on current product contracts and likely regressions. Remove or loosen implementation-phase scaffold tests/files that only verified TDD progress, exact helper names, prompt substrings, or temporary internal structure once the feature is working.

## Tracked Work State

Tracked work persists across sessions under `agent-work/`:

- `agent-work/features.yaml` — backlog and source of truth: id, status, priority, dependencies, and `plan_file`.
- `agent-work/plans/` — active implementation plans (created by `plan-md`, updated during `execute`).
- `agent-work/history/` — archived completed plans (moved here by `commit`; `plan_file` is updated to the archived path).
- `agent-work/tickets/` — sparse, on-demand ticket-local artifacts needed for review or reproduction: temporary scripts, large logs, outputs, screenshots, and validation evidence.
- `agent-work/decks/` — requested HTML briefing/explainer artifacts created for review or maintainer communication.
- `agent-work/<name>/` — optional repo-specific non-durable planning, scratchpad, investigation, or migration artifacts when they do not fit the core directories.

Keep workflow artifacts and non-durable scratch work in `agent-work/`; keep durable architecture, onboarding, and reference documentation in `docs/`. Before handoff or commit, delete `agent-work/` scratch files, temporary logs, generated previews, and one-off experiment outputs unless they remain useful for active plans, review, reproduction, evidence, requested decks, or archived history.

### Ticket Artifact Discipline

Use `agent-work/tickets/<feature-id>/` sparingly:
- Do not create files just to record ordinary reasoning, command transcripts, progress updates, or per-turn summaries. Put current state in the plan checklist and final response.
- For one-off experiments or temporary validation, prefer `mktemp -d` or `/tmp`; remove temp files before finishing.
- Persist only artifacts needed after the turn for review, reproduction, or evidence. Consolidate text into a single `notes.md` or `validation.md` instead of many small files.
- Before handoff or commit, delete obsolete ticket artifacts or state why the remaining artifacts are worth keeping.

User-driven skill workflow (do not advance automatically; stay within the current step):
`next-feature` → `plan-md` → `execute` → `review` → `reflect` → `commit`

`prime` is an optional repository-orientation utility for unfamiliar, resumed, or cross-cutting work. It is not a required workflow stage.

The critic subagents (`plan-critic`, `code-critic`, `docs-critic`) target Codex/Pi bridges; invoked from a Claude Code session they may run zero tools and return empty or fabricated findings. Confirm a critic result reflects the real files (or rerun the critique via a general-purpose agent with the criteria inlined) before trusting it.

### agent-work/features.yaml schema

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

### Mutating agent-work/features.yaml

When `agent-work/features.yaml` exists, avoid reading the full file into context. Use `$SKILLS_ROOT/_lib/features_yaml.sh` for listing epics, registering new tickets (`register` generates the ID and appends in one mutation), selecting the next feature, inspecting a feature by ID (`get <feature-id> --output json`), and updating status/plan fields. `next-id` is for inspection; do not reserve IDs with it before ticket creation. `describe` explains helper commands, not feature IDs. Only fall back to direct YAML edits for operations the helper does not yet cover.

## Skill Helper Setup

Before running skill helper commands, set `SKILLS_ROOT` once per shell/session from the active harness install path; re-set it only when missing or when the harness context changes:

- Codex: `export SKILLS_ROOT="$HOME/.codex/skills"`
- Claude: `export SKILLS_ROOT="$HOME/.claude/skills"`
- Cursor: `export SKILLS_ROOT="$HOME/.cursor/skills"`
- Pi: `export SKILLS_ROOT="$HOME/.pi/agent/skills"`

Skills may be added, removed, or updated during a session. When the user asks to use a specific skill, check the active `$SKILLS_ROOT/<skill-name>/SKILL.md` before assuming it is unavailable or relying on an earlier skill list.
- If the user pastes a complete skill block, use it directly; only re-read the skill file when the block is incomplete, stale-sensitive, or references external files/scripts.
