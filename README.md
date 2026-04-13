# Agent Rules

Minimal skills for AI agents in developer IDEs.

## Philosophy

- **Minimalist:** Only automate what's required
- **Pattern-Driven:** Follow existing codebase conventions
- **Deployment First:** Fix actual blockers, not theoretical issues

## Workflows

### Standalone (Ad-hoc Work)

For quick tasks without multi-session tracking:

`prime` → `plan-md` → `execute` → `review` → `commit`

### Feature-Driven (Multi-Session Projects)

For projects with backlog tracking via `features.yaml`:

`project-init` → `next-feature` → `prime` → `plan-md` → `execute` → `review` → `commit`

Plan file naming indicates tracked vs standalone work: `auth-001.md` = tracked feature, `DARK_MODE.md` = standalone. Creating a plan keeps tracked work `pending`; `execute` moves it to `in_progress`; `commit` moves it to `done`.

## Skills

| Skill | Purpose |
|---------|---------|
| `skills/project-init` | Initialize project with features.yaml |
| `skills/epic-init` | Initialize new epic with features |
| `skills/ticket-init` | Canonical ticket creation for features.yaml |
| `skills/next-feature` | Select next ready feature |
| `skills/prime` | Context prime: structure docs, git history |
| `skills/plan-md` | Create implementation plan |
| `skills/execute` | Implement with baseline verification |
| `skills/review` | Review finished work before archival and commit |
| `skills/commit` | Archive plan, finalize tracked work, commit |
| `skills/test-coverage` | Analyze test coverage |

## Experimental

`experimental/autopilot/` — Claude Code-only autopilot flow. Not part of the main workflow or `AGENTS.md`. See that directory for details.

## Shared Helper Tooling

Shared backlog operations live in `skills/_lib/features_yaml.py` and are invoked through the canonical entrypoint `skills/_lib/features_yaml.sh`.

- Purpose: keep `features.yaml` selection and mutation logic packaged with the repo
- Runtime: `uv` manages the script-local PyYAML dependency
- Contract: `epics`, `next-id`, `next`, `create`, `update`, `complete`, and `describe`

## CLI Tools

### pv - Portfolio & Feature Viewer

Terminal TUI for visualizing and editing `features.yaml` across projects.

**Install:**
```bash
./bin/install.sh
```

**Usage:**
```bash
pv                    # Portfolio view (scan ~/Code)
pv /path/to/dir       # Portfolio view (scan specific directory)
pv features.yaml      # Project view (specific file)
fv                    # Project view (./features.yaml in current dir)
```

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
- `w` - Write changes to features.yaml
- `D` - Delete feature (with confirmation)

**Epic view:**
- `n` - Create new feature in epic

## features.yaml Schema

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
  plan_file: docs/plans/auth-001.md
  references:
    - docs/plans/auth-000.md
  discovered_from: null
  notes: null
```

**Minimal required:** `id`, `status`

**Common tracked-ticket fields:** `epic`, `description`, `priority`, `depends_on`, `created_at`

**Optional fields:** `title`, `steps`, `discovered_from`, `plan_file`, `references`, `completed_at`, plus custom metadata when needed

**Status values:** `pending` → `in_progress` → `done` (or `abandoned`, `superseded`)

## Setup

```bash
./sync-prompts.sh            # copies skills to ~/.claude, ~/.codex, ~/.cursor; copies AGENTS.md/subagents to those plus ~/.pi/agent; points Pi at ~/.claude/skills
./sync-prompts.sh --clean    # also removes stale synced files, including legacy ~/.pi/agent/skills
./sync-prompts.sh --silent   # suppresses the sync summary
```

Sync also ensures `npm:pi-subagents` and `~/.claude/skills` are listed in `~/.pi/agent/settings.json`.

If `~/.claude/settings.json` exists, sync also refreshes the Claude statusline command.

See `AGENTS.md` for coding style and behavioral guidelines.
See `docs/STRUCTURE.md` for project architecture.
