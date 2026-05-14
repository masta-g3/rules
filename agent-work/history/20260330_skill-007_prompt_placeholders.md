**Feature:** skill-007 → Replace positional prompt placeholders

## Outcome

Active workflow prompts no longer rely on positional placeholders like `$1` and `$2`.

Entry-point skills now refer to invocation text in natural language, using phrases like:
- `the provided request`
- `the provided input`
- `the provided feature ID`
- `the provided epic prefix`

Real shell variables that are still meaningful in command examples were preserved, including:
- `$SKILLS_ROOT`
- `$EPIC`
- `$FEATURE_ID`

## Files Updated

- `skills/prime/SKILL.md`
- `skills/plan-md/SKILL.md`
- `skills/project-init/SKILL.md`
- `skills/epic-init/SKILL.md`
- `skills/ticket-init/SKILL.md`
- `skills/autopilot/SKILL.md`
- `skills/_lib/FILE_LOCK.md`

## Key Decisions

- Replace numeric positional placeholders only; do not flatten real shell variables into prose.
- Use semantic wording over parser-centric wording.
- Prefer explicit slot notation like `<feature-id>` in command examples where a value must be substituted.
- Treat `docs/PARALLEL_AGENTS.md` as follow-up documentation cleanup, not part of this change.

## Implementation Summary

- Rewrote prompt entry lines that previously referenced `$1`.
- Replaced `autopilot` branching text that previously depended on `$1` / `$2`.
- Replaced the pseudo-command example `$ticket-init ...` with `/ticket-init ...`.
- Clarified experimental file-lock wording so parallel mode is described in terms of the invoked command, not positional substitution.
- Kept helper commands copy-pastable by preserving legitimate shell variables.

## Verification

- Ran `./bin/pv --help` as a baseline smoke check.
- Verified `rg -n '\$[0-9]+' skills -g '!**/*.sh'` returns no matches.
- Verified `rg -n '\$[0-9]+|\$ticket-init' skills -g '!**/*.sh'` returns no matches.
- Ran `plan-critic` on the implementation plan and incorporated its scope corrections.
- Ran `code-critic` on the modified skill files and addressed the reported clarity issues.

## Checklist Summary

- [x] Remove active `$1` / `$2` usage from in-scope prompt surfaces
- [x] Preserve valid shell-variable examples
- [x] Remove pseudo-command syntax that looked like shell expansion
- [x] Re-read edited prompts as verbatim agent-facing text
- [x] Verify no active positional placeholders remain in scope

## Notes

- `skills/_lib/WORKFLOW.md` was intentionally left out of scope for this pass.
- `docs/PARALLEL_AGENTS.md` remains a documentation-only follow-up if consistency cleanup is wanted later.
