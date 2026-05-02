# skill-012 — Reflect workflow step

**Feature:** Workflow includes a `reflect` step after review to update durable docs and agent guidance from finalized work.

## Summary

Added a minimal `reflect` skill between `review` and `commit`:

```text
next-feature → prime → plan-md → execute → review → reflect → commit
```

The goal is to keep execution and review focused on implementation, then update durable docs only after the work has settled. `commit` is now primarily mechanical: archive the plan, complete tracked state, and create the git commit.

## Implemented Changes

- Added `skills/reflect/SKILL.md`.
  - Routes durable documentation updates by audience:
    - users/operators → `README.md`
    - developers learning architecture/layout/core patterns → `docs/STRUCTURE.md`
    - product/API/design truth → the relevant domain doc
    - recurring agent mistakes, user corrections, review findings, or counterintuitive workflow pitfalls → project-local `AGENTS.md`
  - Allows `NO REFLECTION UPDATES — READY FOR COMMIT` when nothing durable changed.
  - Explicitly avoids code changes, tracked-state changes, archival, commits, and summary-only doc churn.

- Updated workflow skills:
  - `plan-md`: tiny reminder to plan doc updates only when explicit deliverables; otherwise note `Reflection Candidates`.
  - `execute`: tiny reminder to update docs only when explicit deliverables or runtime/build/testable artifacts; otherwise note `Reflection Candidates`.
  - `review`: now runs before `/reflect`, includes planned docs in review scope, and emits `READY FOR REFLECT`.
  - `commit`: assumes work has been reviewed and reflected; no longer owns broad repo-doc updates.

- Updated project docs:
  - `README.md`: workflow chains, handoff labels, and skill table include `reflect`.
  - `docs/STRUCTURE.md`: directory layout, workflow state, Mermaid skill chain, and handoff labels include `reflect`.
  - `AGENTS.md`: canonical workflow includes `reflect`.

- Updated Pi runtime support:
  - `extensions/workflow-indicator.ts` now renders `reflect` as `RF` between `RV` and `CM`.
  - Ran `./sync-prompts.sh --silent` to sync skills, prompts, and extensions.

## Validation

- `uv run pytest -q` → 14 passed.
- `git diff --check` → clean.
- `./sync-prompts.sh --silent` → completed.
- Searched workflow docs/skills for stale main-path `review → commit` references.

## Notes

- No `docs/solutions/` system was added.
- Experimental autopilot remains out of scope.
- Existing unrelated untracked `bin/test_pv_creation.py` was left untouched.
