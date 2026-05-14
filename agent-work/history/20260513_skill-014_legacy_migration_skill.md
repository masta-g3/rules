# skill-014 — Legacy Workflow Migration Skill

## Summary

Added `skills/workflow-migrate`, a concise pre-planning skill for repositories that still use legacy workflow artifact paths such as root `features.yaml`, `docs/plans/`, or `docs/history/`. The skill does not execute migrations; it classifies the repo, stops on mixed legacy/canonical state, and prepares a migration brief for `plan-md`.

## Implemented Changes

- Created `skills/workflow-migrate/SKILL.md` with:
  - canonical target layout under `agent-work/`
  - legacy artifact detection checklist
  - stop conditions for conflicting old/new artifact locations
  - a ready-to-pass migration brief for `plan-md`
  - boundaries against runtime fallback, silent dual-layout support, or direct execution
- Documented that non-durable planning/scratchpad/investigation artifacts belong under `agent-work/`, including optional repo-specific `agent-work/<name>/` directories.
- Clarified that `agent-work/tickets/<feature-id>/` is on-demand storage for temporary ticket-local scripts, logs, outputs, screenshots, and validation evidence.
- Updated public/onboarding docs:
  - `README.md` skill table and workflow artifact summary
  - `docs/STRUCTURE.md` directory layout and design patterns
  - `AGENTS.md` durable agent guidance for `agent-work/` scratch artifacts

## Key Decisions

- Kept migration behavior explicit and planned instead of adding automatic fallback to old paths.
- Made `workflow-migrate` pair with `plan-md` rather than duplicating planning, execution, or commit instructions.
- Kept durable docs in `docs/`; moved only workflow and non-durable agent scratch conventions under `agent-work/`.

## Verification

- Baseline before implementation: `uv run pytest -q` → 20 passed.
- Plan review: `plan-critic` returned LGTM.
- Implementation validation: `uv run pytest -q` → 20 passed; `git diff --check` passed.
- Review: `code-critic` returned LGTM.
- Reflection: no additional durable documentation changes were needed because README, STRUCTURE, and AGENTS were explicit implementation deliverables and already reflected the reviewed result.

## Discovered Work

None.
