# docs-001 — Context Workflow

Implemented a minimal root `CONTEXT.md` documentation workflow.

## Completed

- Added root `CONTEXT.md` for durable project purpose, target user, project type, principles, and project-specific terminology.
- Added an `AGENTS.md` project-orientation pointer telling agents to read `CONTEXT.md` when present for purpose, assumptions, and terminology.
- Updated `skills/project-init/SKILL.md` to create `CONTEXT.md` during scaffolding and gather its content through a focused context interview instead of inference-only generation.
- Updated `skills/reflect/SKILL.md` to route durable changes in project meaning, audience, assumptions, and terminology to `CONTEXT.md` while avoiding implementation summaries and generic terms.
- Updated `docs/STRUCTURE.md` to include `CONTEXT.md` in the repo layout, key files, and durable documentation boundaries.

## Validation

- Ran content checks for required `CONTEXT.md` headings and references across workflow docs.
- Ran residue checks for debug markers.
- Ran `uv run pytest`: 35 tests passed.
- Review found one small duplication in `skills/project-init/SKILL.md`; fixed and re-reviewed successfully.
