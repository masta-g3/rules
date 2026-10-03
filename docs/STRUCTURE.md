# Project Structure

## Where changes belong

| Change | Location | Boundary |
|---|---|---|
| Rules contributor guidance | Root `AGENTS.md` | Repo-local instructions; never deployed. |
| Shared global instructions | `prompts/AGENTS.md` | Native `AGENTS.md` or `CLAUDE.md` for Pi/Codex/Claude; Cursor gets an always-applied `.mdc` rule. |
| Explicit command prompts | `prompts/*.md` except `AGENTS.md` | Claude commands and Pi prompts; generated Codex skills with Cursor links. See [prompt format](../README.md#prompts). |
| Shared workflow instructions | `skills/*/SKILL.md` | One installation in `~/.agents/skills`, with individual Claude links. Pi-only skills, including orchestration, belong in `pi/skills/` with distinct names. |
| Deterministic ticket or worktree operations | `skills/_lib/` | Use the helpers rather than duplicating mutation logic in prompts or extensions. See [ticket helpers](../skills/_lib/features-yaml.md) and [worktree helpers](../skills/_lib/worktrees.md). |
| Reviewer and specialist agents | `agents/` | Pi Markdown sources; generated native Claude/Cursor Markdown and Codex TOML. |
| Deployment | `sync-prompts.sh`, `bin/stage-prompts.py` | Stage formats and preflight conflicts first; reuse manifest-based sync and prune. Never replace personal skill roots or traverse directory links during retirement. |
| Pi runtime behavior | `extensions/` | Keep runtime implementation here, not in Pi core; shared skills may conditionally call its tools. Workflow state, ticket-linked naming, and the workflow UI belong to `extensions/workflow-runtime/`. |
| Portfolio or project dashboard | `bin/pv` | `bin/fv` is an alias, not a separate implementation. |

Edit sources here, not deployed copies under harness home directories. `sync-prompts.sh` deploys shared assets and separate Pi-only assets; see [Setup](../README.md#setup).

## Rules and Hub ownership

Rules works without Hub. The workflow runtime publishes context that Hub can consume; this does not transfer Git or worktree ownership.

Rules-owned worktrees use `skills/_lib/worktrees.sh` and an exact external `worktree.json` record. Hub-owned worktrees remain under Hub operations; do not duplicate them in Rules records. Workflow completion does not mean a worktree was merged or removed.
