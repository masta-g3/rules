# Agent Rules

Minimal skills for AI agents in developer IDEs.

## Philosophy

- **Minimalist:** Only automate what's required
- **Pattern-Driven:** Follow existing codebase conventions
- **Deployment First:** Fix actual blockers, not theoretical issues

## Workflows

### Standalone (Ad-hoc Work)

For quick tasks without multi-session tracking:

`plan-md` → `execute` → `review` → `reflect` → `commit`

### Feature-Driven (Multi-Session Projects)

For projects with backlog tracking via `agent-work/features.yaml`:

`project-init` → `next-feature` → `plan-md` → `execute` → `review` → `reflect` → `commit`

Plan file naming indicates tracked vs standalone work: `auth-001.md` = tracked feature, `DARK_MODE.md` = standalone. Creating a plan keeps tracked work `pending`; `execute` moves it to `in_progress`; `commit` moves it to `done` after `reflect` handles durable documentation updates.

Workflow artifacts live under `agent-work/`: backlog state in `features.yaml`, active plans in `plans/`, archives in `history/`, generated HTML explainers in `decks/`, sparse ticket-local evidence or reproduction assets in `tickets/`, and repo-specific planning or scratchpad areas when needed. Durable documentation remains in `docs/`.

## Skills

| Skill | Purpose |
|---------|---------|
| `skills/project-init` | Initialize project with agent-work/features.yaml |
| `skills/context-md` | Create or refresh root CONTEXT.md |
| `skills/epic-init` | Initialize new epic with features |
| `skills/ticket-init` | Canonical ticket creation for agent-work/features.yaml |
| `skills/next-feature` | Select next ready feature |
| `skills/plan-md` | Create implementation plan |
| `skills/execute` | Implement with baseline verification |
| `skills/explain-html` | Create self-contained HTML technical explainers |
| `skills/answer-style` | Reshape a response to the AGENTS.md communication style |
| `skills/review` | Review finished work before reflection and commit |
| `skills/reflect` | Update durable docs and agent guidance after review |
| `skills/commit` | Archive plan, finalize tracked work, commit |
| `skills/workflow-orchestrator` | Parent-gated persistent-subagent automation, per ticket or in parallel worktrees |
| `skills/test-coverage` | Analyze test coverage |
| `skills/docs-health` | Assess durable documentation health |

## Experimental

`experimental/autopilot/` — Claude Code-only autopilot flow. Not part of the main workflow or `AGENTS.md`. See that directory for details.

## Pi Runtime Assets

Project-local Pi extensions live in `extensions/` and sync into `~/.pi/agent/extensions/` via `./sync-prompts.sh`. Pi auto-loads synced extensions on startup; use `/reload` in an existing Pi session after syncing.

Pi-only subagents live in `pi/agents/` and overlay into `~/.pi/agent/agents/` after the shared `agents/` sync. Use this for agents with Pi-specific providers, tools, or skills.

Pi-only skills live in `pi/skills/` and overlay into `~/.pi/agent/skills/` after the shared `skills/` sync. Use this only for skills that depend on Pi runtime behavior and should not appear in Claude, Cursor, or Codex skill roots.

`pi/skills/focus` provides `/skill:focus <ticket-id>` for autonomous work on an approved plan, feature, or task. It delegates implementation behavior to `execute`, while `extensions/workflow-runtime/` owns workflow state, the pulsing `FOC ✦` / `FOC ✧` rail, and guarded continuation delivery. Every completed turn automatically produces a compact, expandable continuation event reminding the agent to re-read the active plan when one exists and keep working; there is no turn limit or response marker. The agent ends the loop by calling `end_focus` with a `completed` or `blocked` outcome and summary. Manual user input also stops focus mode, compaction preserves it, and reload, restart/resume, new session, or fork requires explicit reinvocation.

`extensions/skill-thinking.ts` reads `metadata.thinkingLevel` from workflow skill frontmatter for typed `/skill:<name>` commands, sets Pi's thinking level for that turn, and restores the previous level when the turn ends. Without the extension installed, the metadata is inert; non-Pi harnesses ignore it.

`extensions/notify.ts` sends a native macOS notification plus a direct `afplay` sound when Pi returns to input. Use `/notify-test` after `/reload` to verify local sound/notification permissions.

Current Pi-specific extension work also includes a minimalist workflow rail that highlights the active tracked-work skill step inside Pi:

`plan-md → execute → review → reflect → commit`

This is a visual cue only. It appears after a tracked workflow skill has been invoked (or when restoring an existing session state) and reflects the most recently invoked workflow step, not authoritative feature completion state.

Ticket context and shortcuts:

- Invoking a workflow skill with an explicit ticket (`/skill:plan-md engine-003`) makes the rail remember that ticket, show it beside the active step, and inject `Active workflow ticket: engine-003` into later turns until cleared.
- `/wf-ticket <ticket-id>` sets or overrides the active ticket manually, even before a workflow step is visible in the rail. `/wf-clear` clears both the rail and the active ticket.
- Double-press `ctrl+shift+right` to run the next workflow skill (with the active ticket when set); on `commit`, the same double-press clears the indicator instead. Ignored while Pi is busy or the editor contains unsent text.
- Forking a session clears the workflow indicator and ticket context in the fork.

## Shared Helper Tooling

Shared backlog operations live in `skills/_lib/features_yaml.py` and are invoked through the canonical entrypoint `skills/_lib/features_yaml.sh`.

- Purpose: keep `agent-work/features.yaml` selection and mutation logic packaged with the repo
- Runtime: `uv` manages the script-local PyYAML dependency
- Contract: `epics`, `next-id`, `register`, `next`, `get`, `create`, `update`, `complete`, and `describe`
- Direct lookup: `skills/_lib/features_yaml.sh get <feature-id> --output json`
- Ticket creation: `register --json '{"epic":"auth","title":"..."}'` generates the next ID and appends the feature in one mutation
- Pipeline input: `register --json -`, `create --json -`, and `update <feature-id> --json -` read JSON objects from stdin
- Retry behavior: repeated no-op `update` returns `changed:false` and does not rewrite the file

## CLI Tools

### pv - Portfolio & Feature Viewer

Terminal TUI for visualizing and editing `agent-work/features.yaml` across projects. `pv`/`fv` are human tools; agents and scripts should use `skills/_lib/features_yaml.sh` for deterministic JSON/id output.

**Install:**
```bash
./bin/install.sh
```

**Usage:**
```bash
pv                    # Portfolio view (scan ~/Code)
pv /path/to/dir       # Portfolio view (scan specific directory)
pv agent-work/features.yaml  # Project view (specific file)
fv                          # Project view (./agent-work/features.yaml in current dir)
```

When stdin is not a TTY, `pv`/`fv` render one read-only snapshot and exit 0. Treat that as inspection output, not a machine-readable API.

**Navigation:**
- `j/k` or `↑/↓` - Move selection
- `Enter` - Drill down (Portfolio → Project → Epic → Feature)
- `Esc/b` - Go back
- `h/?` - Help
- `q` - Quit

**Portfolio controls:**
- `s` - Cycle sort mode (open/modified/total/completion)
- `f` - Cycle filter mode (open/all/active/stalled/archived)
- `A` - Toggle archive state of selected project
- `t` - Switch to tree view

**Tree view:**
- `h/l` or `←/→` - Collapse/expand node
- `o` - Toggle expand, `O` - Expand all, `M` - Collapse all
- `/` - Search, `n/N` - Next/prev match
- `z` - Zoom to node, `t` - Back to table view

**Feature editing:**
- `e` - Enter edit mode
- `Tab` - Next field, `j/k` - Cycle status options
- `Esc` - Exit edit mode
- `w` - Write changes to agent-work/features.yaml
- `D` - Delete feature (with confirmation)

**Epic view:**
- `n` - Create new feature in epic

## Testing

```bash
uv run pytest -q
```

Pytest is scoped to `tests/` via `pytest.ini`.

## agent-work/features.yaml Schema

```yaml
- id: auth-001
  epic: auth
  status: pending
  title: User can sign up
  description: Implement signup flow with email validation
  priority: 1
  depends_on:
    - auth-000
  steps:
    - Create form
    - Add validation
    - Connect API
  created_at: 2024-01-15
  plan_file: agent-work/plans/auth-001.md
  references:
    - agent-work/plans/auth-000.md
  discovered_from: null
  notes: null
```

**Minimal required:** `id`, `status`

**Common tracked-ticket fields:** `epic`, `description`, `priority`, `depends_on`, `created_at`

**Optional fields:** `title`, `steps`, `discovered_from`, `plan_file`, `references`, `completed_at`, plus custom metadata when needed

**Status values:** `pending` → `in_progress` → `done` (or `abandoned`, `superseded`)

## Setup

```bash
./sync-prompts.sh            # leaves Codex unprompted; copies workflow skills/subagents to Claude, Cursor, and Pi; overlays Pi-only skills/subagents/extensions into ~/.pi/agent
./sync-prompts.sh --silent   # suppresses the sync summary
```

Sync records what it deploys in per-directory `.rules-manifest-*` files and prunes repo-managed assets that were later deleted from the repo; user-installed skills, subagents, and extensions are never touched.

Codex receives no `AGENTS.md`, skills, or subagents. Sync prunes repo-managed Codex prompt/workflow assets so Codex stays suitable for chat, browser-style research, and ad hoc tasks rather than tracked project workflow.

Sync also ensures `npm:pi-tmux-subagents` and `~/.pi/agent/skills` are listed in `~/.pi/agent/settings.json`.

If `~/.claude/settings.json` exists, sync also refreshes the Claude statusline command.

See `AGENTS.md` for coding style and behavioral guidelines.
See `PRINCIPLES.md` for distilled principles on working with coding agents.
See `docs/STRUCTURE.md` for project architecture.
