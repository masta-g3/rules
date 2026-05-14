**Feature:** skill-002 -> Clarify workflow contracts across skills and helpers

## Summary

This change cleaned up the repo's active workflow so the docs, helpers, and backlog schema describe the same behavior.

The work resolved the main sources of drift:

- lifecycle ownership for `pending -> in_progress`
- dependency readiness semantics in `next-feature`
- replacement of overloaded `spec_file` with `plan_file` plus `references`
- ticket-creation ownership in `ticket-init`
- archive helper behavior vs commit instructions
- discovered-work ID guidance in `execute`

## Implemented Decisions

### Workflow semantics

- `execute` is the only skill that activates tracked work
- planning keeps tracked tickets `pending`
- `next-feature` resumes active `in_progress` work first
- pending work is only ready when all `depends_on` items are `done`

### Schema contract

- `plan_file` stores the ticket's own active or archived plan path
- `references` stores shared context docs such as epic, design, or vision docs
- `depends_on` is the canonical dependency field
- discovered work keeps normal `{epic}-{nnn}` IDs and uses `discovered_from` for lineage

### Skill ownership

- `ticket-init` is the canonical ticket-creation workflow
- `plan-md` only invokes `ticket-init` when a new tracked ticket is needed
- `epic-init` uses `ticket-init` for registration, then enriches created tickets with decomposition-specific fields
- `commit` now relies on helper-backed archive and completion updates that match the documented contract

## Files Updated

- `AGENTS.md`
- `README.md`
- `docs/STRUCTURE.md`
- `features.yaml`
- `skills/plan-md/SKILL.md`
- `skills/next-feature/SKILL.md`
- `skills/_lib/select_next_feature.sh`
- `skills/epic-init/SKILL.md`
- `skills/ticket-init/SKILL.md`
- `skills/execute/SKILL.md`
- `skills/commit/SKILL.md`
- `skills/commit/scripts/archive_plan.sh`
- `skills/commit/scripts/mark_done.sh`

## Verification

- `pv --help` still worked as a baseline smoke check
- `select_next_feature.sh` was tested for both active-work resumption and done-only dependency readiness
- `archive_plan.sh` was tested to ensure it returns the final path and removes the original plan file
- `mark_done.sh` was tested for both successful completion updates and clear failure when the target feature is missing
- `features.yaml` no longer uses `spec_file`

## Outcome

The active workflow docs and helper scripts now describe the same contracts, and the backlog schema uses one set of field names and document-pointer semantics.
