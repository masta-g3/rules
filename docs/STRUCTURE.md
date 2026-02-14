# Project Structure

AI IDE agent skills set for feature-driven development workflows.

## Directory Layout

```
rules/
├── bin/                # CLI tools
│   ├── pv              # Portfolio & Feature Viewer TUI
│   ├── fv -> pv        # Symlink: project-level alias
│   └── install.sh      # Install pv/fv to ~/.local/bin
│
├── skills/             # Canonical workflow skills
│   ├── _lib/           # Shared deterministic shell helpers
│   ├── autopilot/
│   ├── commit/
│   ├── epic-init/
│   ├── execute/
│   ├── next-feature/
│   ├── plan-md/
│   ├── prime/
│   ├── project-init/
│   ├── test-coverage/
│   └── ticket-init/
├── statusline/         # Claude Code statusline config
│
├── docs/
│   ├── history/        # Archived implementation plans
│   ├── plans/          # Active implementation plans
│   ├── STRUCTURE.md    # This file
│   └── PARALLEL_AGENTS.md
│
├── features.yaml       # This project's feature backlog
├── AGENTS.md           # Coding style & behavioral guidelines
├── README.md           # Usage documentation
├── sync-prompts.sh     # Deploy skills to ~/.claude, ~/.codex, ~/.cursor
└── setup-autopilot.sh  # Enable autopilot hooks in a project
```

## Core Concepts

### Feature-Driven Workflow

Projects track work in `features.yaml`:
```
[feature] → plan-md → [plan.md] → execute → commit → [done]
```

Features have: id, status, epic, dependencies, priority, steps.

### Skill Chain

```mermaid
graph LR
    prime["prime skill"] --> plan["plan-md skill"]
    plan --> execute["execute skill"]
    execute --> commit["commit skill"]
    commit --> next["next-feature skill"]
    next --> prime
```

### pv/fv TUI

Terminal dashboard for `features.yaml` visualization and editing:
- **pv**: Portfolio view - scans directory tree for all projects
- **fv**: Feature view - single project's features.yaml

Navigation: Portfolio → Project → Epic → Feature (4-level drill-down)

Modes:
- **Table view**: Default list-based navigation with sorting/filtering
- **Tree view**: Collapsible hierarchy with search (`/`) and zoom (`z`)
- **Edit mode**: Inline feature editing with field navigation and save (`w`)

## Key Files

| File | Purpose |
|------|---------|
| `features.yaml` | Feature backlog (sequence of feature objects) |
| `AGENTS.md` | Agent behavior rules, copied to project roots |
| `sync-prompts.sh` | Deploys skills to IDE agent directories |

## Design Patterns

- **Single-file tools**: `bin/pv` is self-contained Python (requires PyYAML)
- **Skill-first workflows**: `skills/*/SKILL.md` defines behavior; scripts handle deterministic mutations
- **State in filenames**: `auth-001.md` = tracked feature, `DARK_MODE.md` = standalone
- **yq for YAML ops**: Avoid loading large features.yaml into context
