# Project Structure

## Where changes belong

| Change | Location | Boundary |
|---|---|---|
| Shared workflow instructions | `skills/*/SKILL.md` | Keep shared skills portable across harnesses. The sync script supports optional Pi-only overlays in `pi/skills/`. |
| Deterministic ticket or worktree operations | `skills/_lib/` | Use the helpers rather than duplicating mutation logic in prompts or extensions. See [ticket helpers](../skills/_lib/features-yaml.md) and [worktree helpers](../skills/_lib/worktrees.md). |
| Reviewer and specialist agents | `agents/` | These are shared sources, including agents used by Pi. Sync adapts them for other harnesses. |
| Pi runtime behavior | `extensions/` | Keep runtime implementation here, not in Pi core; shared skills may conditionally call its tools. Workflow state, ticket-linked naming, and the workflow UI belong to `extensions/workflow-runtime/`. |
| Portfolio or project dashboard | `bin/pv` | `bin/fv` is an alias, not a separate implementation. |

Edit sources here, not deployed copies under harness home directories. `sync-prompts.sh` deploys shared assets and then Pi-only overlays; see [Setup](../README.md#setup).

## Rules and Hub ownership

Rules works without Hub. The workflow runtime publishes context that Hub can consume; this does not transfer Git or worktree ownership.

Rules-owned worktrees use `skills/_lib/worktrees.sh` and an exact external `worktree.json` record. Hub-owned worktrees remain under Hub operations; do not duplicate them in Rules records. Workflow completion does not mean a worktree was merged or removed.
