# AI IDE Agent Command Set

Minimal, elegant, and pragmatic commands for use by AI agents embedded in developer IDEs.

## Philosophy

- **Minimalist & No-Bloat:** Only automate what is required—no unnecessary features or refactoring.
- **Pattern-Driven:** Follow existing codebase conventions.
- **Deployment First:** Fix only actual blockers to deployment or CI/CD.
- **Readable, Modular, Elegant:** Less is more. Prioritize code clarity and lightweight solutions.

## Core Guidelines

- `AGENTS.md`
  Overarching principles and behavioral expectations for AI agents.
  Includes coding style, documentation standards, and features.json operations.

## Workflows

### Standalone (Ad-hoc Work)

For quick tasks without multi-session tracking:

```
/prime "task description"    → gather codebase context
/plan-md "task description"  → create implementation plan (FEATURE_NAME.md)
/execute                     → implement with baseline verification
/commit                      → archive plan, commit changes
```

### Feature-Driven (Multi-Session Projects)

For complex projects with backlog tracking via `features.json`:

```
/project-init "project description"  → scaffold project, generate features.json
/next-feature                        → select next ready feature
/plan-md "feature-id: description"   → create plan (feature-id.md)
/execute                             → implement, update status to in_progress
/commit                              → archive, update status to done
```

The plan file name carries state: `auth-001.md` = tracked feature, `DARK_MODE.md` = standalone.

## Key Commands

| Command | Purpose |
|---------|---------|
| `project-init.md` | Initialize project with `features.json` backlog |
| `next-feature.md` | Select next ready feature (by priority + dependencies) |
| `prime.md` | Context prime: read structure docs, git history |
| `plan-md.md` | Create detailed implementation plan with phases |
| `execute.md` | Implement plan with baseline verification |
| `commit.md` | Archive plan, update features.json, commit |
| `prechecks.md` | Pre-deployment verification (build, env, API) |

## features.json Schema

```json
{
  "id": "auth-001",
  "description": "User can sign up",
  "steps": ["..."],
  "status": "pending",
  "priority": 1,
  "depends_on": [],
  "discovered_from": null,
  "spec_file": null,
  "created_at": "2024-01-15"
}
```

- **status**: `pending` → `in_progress` → `done` (or `blocked`)
- **depends_on**: explicit blockers; feature is "ready" when all deps are done
- **discovered_from**: links emergent work to parent feature
- **spec_file**: path to archived spec (set by commit)

## Usage

Designed for integration with Claude Code, Codex, Cursor or similar AI agents in developer environments.
Consult IDE provider for further instructions.

## Contributing

- Keep all additions minimal, pattern-aligned, and deployment-focused.
- Document new commands precisely and update structure docs as needed.
