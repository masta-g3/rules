## Communication Style

- Write for an ADHD reader: answer first — or the action itself (command, path, snippet); context after, if at all. No preamble, filler, apologies, or closing pleasantries.
- Report in the spirit of ASD-STE100 Simplified Technical English: short declarative sentences, active voice, plain words.
- Number multi-step work; restate position each turn ("step 3 of 5 done; next: backfill"). If anything is open, end with one concrete next action.
- Ambiguous request: use the ask-user tool, don't guess.
- When asking the user a question, assume they have not read the code. Use product language, explain unavoidable technical terms, and show a small ASCII mockup or option preview when UI choices are easier to see than describe.
- The user often dictates via speech-to-text: infer the intended words from garbled or misheard phrases; ask only when the intent is genuinely unclear.

## Project Orientation

- Read root `CONTEXT.md` when present to understand the project's purpose, target user, stage, operating assumptions, and terminology.
- Check `docs/STRUCTURE.md` to understand project organization; if missing, continue without it.
- Before adding code, inspect the existing structure and similar solutions.
- For unfamiliar or resumed work, also check recent git history and `agent-work/history` before planning; scout cross-cutting tasks with parallel read-only subagents.
- When working with Python, always use the `uv` tool for dependency management and virtual environments.

## Collaboration and Codebase Workflow

- Other engineers or agents may be working on this repository concurrently. If you notice unexpected changes (new files, modified code, updated dependencies), do not revert or overwrite them — adapt to the current state. If others' changes break your work or block progress, report the conflict to the user instead of guessing a fix.
- Stay on the branch and checkout initially provided. Do not create or switch branches, create git worktrees, merge, rebase, or otherwise change git topology unless the user explicitly requests it or approves a proposed workflow that requires it.

## Implementation Principles

- Apply via negativa: first ask what can be removed, simplified, or left undone. Add code, abstractions, dependencies, tests, or documentation only when subtraction cannot solve the problem.
- Prefer the simplest fundamental solution for the current context over the quickest local patch. Replace obsolete code or text instead of appending parallel versions.
- Unless the repo style dictates it, prefer a minimalistic functional programming approach over complex over-abstracted OOP.
- Avoid enterprise bloat, boilerplate, thin wrappers, and unnecessary abstractions.
- If an approach is not working, report and brainstorm with the user instead of forcing a brittle implementation.
- Do not introduce new patterns unless strictly needed. If you need to do so, discuss it with the user.
- Keep function names direct and simple; avoid names like `enhanced` or `new`.
- Comment only non-obvious logic; avoid changelog-style comments.
- Skip redundant validations unless failure has real consequences.
- Let errors surface naturally. Avoid blanket `try/except`, especially `pass`.
- Avoid fallback mechanisms, mock data, inferred defaults, or backward compatibility layers unless explicitly requested.

## Testing

- Follow **Test Driven Development**: write tests first, iterate until passing.
- Use ephemeral tests to validate features; remove all temporary test code and artifacts when done.
- Keep only durable tests focused on current product contracts and likely regressions. Remove implementation-phase tests/files that only verified progress or that are too specific to situations unlikely to recur.

## Tracked Work State

Tracked work persists across sessions under `agent-work/`:

- `agent-work/features.yaml` — backlog and source of truth: id, status, priority, dependencies, and `plan_file`.
- `agent-work/plans/` — active implementation plans (created by `plan-md`, updated during `execute`).
- `agent-work/history/` — archived completed plans (moved here by `commit`; `plan_file` is updated to the archived path).
- `agent-work/tickets/` — sparse, on-demand ticket-local artifacts needed for review or reproduction: temporary scripts, logs, outputs, screenshots, and validation evidence.
- `agent-work/decks/` — requested HTML briefing/explainer artifacts created for review or maintainer communication.
- `agent-work/<name>/` — optional repo-specific non-durable planning, scratchpad, investigation, or migration artifacts when they do not fit the core directories.

Keep workflow artifacts and non-durable scratch work in `agent-work/`; keep durable architecture, onboarding, and reference documentation in `docs/`. Before handoff or commit, delete `agent-work/` temporary files unless they remain useful for active plans, review, reproduction or evidence.

## Papercuts

When working on a long-running task, create `agent-work/tickets/<ticket>/papercuts.md` to capture meaningful friction likely to recur in repo or harness operations—failed commands, unclear interfaces, misleading paths, or missing documentation—which can later improve the system; create no record when work goes smoothly.

### Ticket Artifact Discipline

Use `agent-work/tickets/<feature-id>/` sparingly:
- Do not create files just to record ordinary reasoning, command transcripts, progress updates, or per-turn summaries. Put current state in the plan checklist and final response.
- For one-off experiments or temporary validation, prefer `mktemp -d` or `/tmp`; remove temp files before finishing.
- Persist only artifacts needed after the turn for review, reproduction, or evidence. Consolidate text into a single `notes.md` or `validation.md` instead of many small files.
- Before handoff or commit, delete obsolete ticket artifacts or state why the remaining artifacts are worth keeping.

## Execution Workflow

User-driven skill workflow: `next-feature` → `plan-md` → `execute` → `review` → `reflect` → `commit`

Each workflow step ends your turn: finish the invoked step, report, and stop for user feedback. Never invoke the next workflow skill or do its work uninvoked — `READY FOR <STEP>` labels tell the user what to invoke next, not you. Chain steps only when the user explicitly asked for it in their request (e.g., "plan and execute this"). Do not execute these skills unless suggested by the user.

When acting on critic feedback (`plan-critic`, `code-critic`, `docs-critic`): fix only clear, high-impact issues; ignore nits, low-confidence, or out-of-scope suggestions; re-run only after material changes. Discard any critic result that clearly did not read the real files.

### agent-work/features.yaml schema

Root-level sequence (not wrapped in a mapping):

```yaml
- id: auth-001
  status: pending  # pending | in_progress | done | abandoned | superseded
  title: "Email signup"       # 1–3 words, max 32 normalized characters
  subtitle: "Validate email before account creation" # 4–6 words, max 64
  description: "User can create an account after email validation." # one sentence, max 240
  priority: 1
  created_at: 2024-01-15
  # persist only meaningful optional fields: depends_on, plan_file,
  # discovered_from, references, and terminal completion fields
```

### Mutating agent-work/features.yaml

New tickets require `id`, `status`, `title`, `subtitle`, `description`, `priority`, and `created_at`. The ID prefix is authoritative, so `register` accepts `epic` for allocation but does not persist it. Never add `steps`; detailed scope and checklists belong in the Markdown plan. Readers remain tolerant of legacy and unknown fields.

When `agent-work/features.yaml` exists, avoid reading the full file into context. Use `$SKILLS_ROOT/_lib/features_yaml.sh` for listing epics, registering new tickets (`register` generates the ID and appends in one mutation), selecting the next feature, inspecting a feature by ID (`get <feature-id> --output json`), and updating status/plan fields. `next-id` is for inspection; do not reserve IDs with it before ticket creation. `describe` explains helper commands, not feature IDs. Only fall back to direct YAML edits for operations the helper does not yet cover.

## Skill Helper Setup

Before running skill helper commands, set `SKILLS_ROOT` once per shell/session from the active harness install path; re-set it only when missing or when the harness context changes:

- Codex: `export SKILLS_ROOT="$HOME/.codex/skills"`
- Claude: `export SKILLS_ROOT="$HOME/.claude/skills"`
- Cursor: `export SKILLS_ROOT="$HOME/.cursor/skills"`
- Pi: `export SKILLS_ROOT="$HOME/.pi/agent/skills"`

Skills may be added, removed, or updated during a session. When the user asks to use a specific skill, check the active `$SKILLS_ROOT/<skill-name>/SKILL.md` before assuming it is unavailable or relying on an earlier skill list.
- If the user pastes a complete skill block, use it directly; only re-read the skill file when the block is incomplete, stale-sensitive, or references external files/scripts.
