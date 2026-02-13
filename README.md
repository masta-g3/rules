# AI IDE Agent Skill Set

Minimal skills for AI agents in developer IDEs.

## Philosophy

- **Minimalist:** Only automate what's required
- **Pattern-Driven:** Follow existing codebase conventions
- **Deployment First:** Fix actual blockers, not theoretical issues

## Workflows

### Standalone (Ad-hoc Work)

For quick tasks without multi-session tracking:

`prime` → `plan-md` → `execute` → `commit`

### Feature-Driven (Multi-Session Projects)

For projects with backlog tracking via `features.yaml`:

`project-init` → `next-feature` → `plan-md` → `execute` → `commit`

Plan file name carries state: `auth-001.md` = tracked feature, `DARK_MODE.md` = standalone.

### Autopilot (Claude Code Only)

Autonomous feature cycle via Stop hooks:

`autopilot` starts the same feature cycle and is provider-gated to Claude hook environments.

Chain: `prime` → `plan-md` → `execute` → `commit`

Single mode stops after one feature. Continuous mode (`--epic`) loops back after each commit until no ready features remain in the epic.

Stops on exceptions (baseline fails, tests fail, conflicts) with resume instructions.

**Enable in a project:**
```bash
/path/to/rules/setup-autopilot.sh /your/project
```

## Skills

| Skill | Purpose |
|---------|---------|
| `skills/autopilot` | Autonomous feature cycle (Claude Code) |
| `skills/project-init` | Initialize project with features.yaml |
| `skills/epic-init` | Initialize new epic with features |
| `skills/ticket-init` | Add a single ticket to features.yaml |
| `skills/next-feature` | Select next ready feature |
| `skills/prime` | Context prime: structure docs, git history |
| `skills/plan-md` | Create implementation plan |
| `skills/execute` | Implement with baseline verification |
| `skills/commit` | Archive plan, commit |
| `skills/test-coverage` | Analyze test coverage |

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
  spec_file: docs/plans/auth-001.md
  discovered_from: null
  notes: null
```

**Required:** `id`, `status`

**Status values:** `pending` → `in_progress` → `done` (or `abandoned`, `superseded`)

**Key fields:**
- **epic**: Groups related features (e.g., "auth", "payments")
- **depends_on**: Feature is "ready" when all deps are done
- **steps**: Implementation checklist
- **discovered_from**: Links emergent work to parent feature
- **spec_file**: Path to implementation plan

## Setup

```bash
./sync-prompts.sh   # copies skills to ~/.claude, ~/.codex, ~/.cursor
```

See `AGENTS.md` for coding style and behavioral guidelines.
See `docs/STRUCTURE.md` for project architecture.
