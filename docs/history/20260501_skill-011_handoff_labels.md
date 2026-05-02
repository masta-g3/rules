**Feature:** skill-011 → Workflow skills emit consistent READY FOR handoff labels between each step

## Summary

Standardized terminal handoff labels across the existing workflow without changing workflow order, status transitions, or runtime behavior.

Workflow remains:

```text
next-feature → prime → plan-md → execute → review → commit
```

## Implemented

- `skills/next-feature/SKILL.md` ends actionable recommendations with `READY FOR PRIME`.
- `skills/prime/SKILL.md` ends successful context gathering with `READY FOR PLAN`.
- `skills/plan-md/SKILL.md` reports the plan path and ends with `READY FOR EXECUTE`.
- `skills/execute/SKILL.md` now reports `READY FOR REVIEW` instead of `PLAN COMPLETE`.
- `skills/review/SKILL.md` keeps `READY FOR COMMIT` and clarifies it means implementation passed review.
- `skills/commit/SKILL.md` ends successful commits with `WORKFLOW COMPLETE` and the commit hash.
- `README.md` and `docs/STRUCTURE.md` document that labels are user-facing handoffs, not permission to automatically advance skills.
- `agents/code-critic.md` and `agents/plan-critic.md` were updated with explicit model/thinking metadata.

## Verification

- `rg "READY FOR|WORKFLOW COMPLETE|PLAN COMPLETE" skills README.md docs/STRUCTURE.md AGENTS.md`
- `uv run pytest -q` → 14 passed

## Notes

The proposed future `reflect` step was intentionally not added in this feature. If added later, `review` should hand off with `READY FOR REFLECT`, and `reflect` should hand off with `READY FOR COMMIT`.
