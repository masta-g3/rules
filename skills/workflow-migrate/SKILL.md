---
name: workflow-migrate
description: Prepare an explicit migration plan for repos using legacy root features.yaml or docs-based workflow artifacts.
argument-hint: "[migration request]"
metadata:
  thinkingLevel: medium
---

Use this skill when a user asks to migrate a repository from the legacy workflow layout to canonical `agent-work/` paths.

This is a pre-planning skill. It gathers migration facts and produces a compact brief for `plan-md`; it does not move files, edit YAML, or create the implementation plan unless the user separately invokes `plan-md`.

## Canonical Target Layout

Core workflow artifacts:

- `agent-work/features.yaml` — tracked backlog and source of truth
- `agent-work/plans/` — active implementation plans
- `agent-work/history/` — archived implementation plans and workflow notes
- `agent-work/tickets/` — sparse, on-demand ticket-local evidence or reproduction artifacts

Optional repo-specific workflow areas may also live under `agent-work/<name>/` for planning notes, scratchpads, investigations, migration logs, or other non-durable agent artifacts that do not belong in durable docs.

Keep durable architecture, onboarding, reference, and product documentation in `docs/`.

## Legacy Inputs To Inspect

Inspect only enough to classify the repository layout:

- root `features.yaml`
- `docs/plans/`
- `docs/history/`
- planning notes, scratchpads, investigation logs, or other non-durable workflow docs mixed into `docs/` or the repository root
- existing canonical paths under `agent-work/`

Prefer simple read-only commands such as `test`, `find`, `ls`, and `rg`.

## Stop Conditions

Stop and ask the user before planning if both legacy and canonical locations contain data for the same artifact type:

- both `features.yaml` and `agent-work/features.yaml` exist
- both `docs/plans/` and `agent-work/plans/` contain files
- both `docs/history/` and `agent-work/history/` contain files
- a non-durable planning/scratch artifact has no obvious canonical destination under `agent-work/`

Ask whether to merge, overwrite, rename into a repo-specific `agent-work/<name>/` directory, or stop. Do not guess.

## Migration Brief For plan-md

If the repo is safe to plan, produce a concise brief with the detected facts and these target actions:

- move root `features.yaml` to `agent-work/features.yaml`
- move `docs/plans/*` to `agent-work/plans/`
- move `docs/history/*` to `agent-work/history/`
- create `agent-work/tickets/.gitkeep`
- use `agent-work/tickets/<feature-id>/` sparingly for ticket-local scripts, large logs, outputs, screenshots, and validation evidence that should survive the turn
- move other non-durable planning/scratchpad artifacts into a clear `agent-work/<name>/` location selected for that repo
- update `plan_file` and `references` values from old paths to new paths
- update project docs or agent prompts that still instruct agents to use old paths
- validate no default workflow references still point to root `features.yaml`, `docs/plans/`, or `docs/history/`

## Boundaries

- Do not add runtime fallback to legacy paths.
- Do not silently support both old and new layouts.
- Do not execute file moves directly from this skill.
- Do not duplicate the full `plan-md`, `execute`, or `commit` instructions.
- Treat `plan-md` as authoritative once planning begins.

## Output

If safe to plan, report:

```text
MIGRATION BRIEF READY
Summary: <1-2 sentences describing detected legacy artifacts and target agent-work layout>
Next: Run /plan-md with the migration brief above.
READY FOR PLAN
```

If blocked, report:

```text
BLOCKED — <conflict or missing decision>
```
