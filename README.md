# AI IDE Agent Command Set

Minimal commands for AI agents in developer IDEs.

## Philosophy

- **Minimalist:** Only automate what's required
- **Pattern-Driven:** Follow existing codebase conventions
- **Deployment First:** Fix actual blockers, not theoretical issues

## Workflows

### Standalone (Ad-hoc Work)

For quick tasks without multi-session tracking:

```
/prime "task"       → gather codebase context
/plan-md "task"     → create implementation plan
/execute            → implement with baseline verification
/commit             → archive plan, commit changes
```

### Feature-Driven (Multi-Session Projects)

For projects with backlog tracking via `features.json`:

```
/project-init "description"   → scaffold project, generate features.json
/next-feature                 → select next ready feature
/plan-md "feature-id"         → create plan (feature-id.md)
/execute                      → implement, update status
/commit                       → archive, mark done
```

Plan file name carries state: `auth-001.md` = tracked feature, `DARK_MODE.md` = standalone.

### Autopilot (Claude Code Only)

Autonomous feature cycle via Stop hooks:

```
/autopilot              → picks next feature, runs full cycle
/autopilot feature-id   → runs cycle for specific feature
```

Chains: `/prime` → `/plan-md` → `/execute` → `/commit`

Stops on exceptions (baseline fails, tests fail, conflicts) with resume instructions.

**Enable in a project:**
```bash
/path/to/rules/setup-autopilot.sh /your/project
```

## Commands

| Command | Purpose |
|---------|---------|
| `autopilot.md` | Autonomous feature cycle (Claude Code) |
| `project-init.md` | Initialize project with features.json |
| `next-feature.md` | Select next ready feature |
| `prime.md` | Context prime: structure docs, git history |
| `plan-md.md` | Create implementation plan |
| `execute.md` | Implement with baseline verification |
| `commit.md` | Archive plan, commit |
| `prechecks.md` | Pre-deployment verification |

## features.json Schema

```json
{
  "id": "auth-001",
  "description": "User can sign up",
  "status": "pending",
  "priority": 1,
  "depends_on": [],
  "discovered_from": null,
  "spec_file": null,
  "created_at": "2024-01-15"
}
```

- **status**: `pending` → `in_progress` → `done` (or `blocked`)
- **depends_on**: feature is "ready" when all deps are done
- **discovered_from**: links emergent work to parent feature

## Setup

```bash
./sync-prompts.sh   # copies commands to ~/.claude, ~/.codex, ~/.cursor
```

See `AGENTS.md` for coding style and behavioral guidelines.
