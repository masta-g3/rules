---
name: context-md
description: Create or refresh root CONTEXT.md for an existing project by investigating the repo, forming context hypotheses, and interviewing the user.
argument-hint: "[optional focus]"
metadata:
  thinkingLevel: high
---

Create or update only root `CONTEXT.md`. Do not scaffold the project, create tickets, or update unrelated docs.

### 1. Explore Existing Project

Inspect the repo broadly before interviewing:

- `README.md`
- existing `CONTEXT.md` when present
- `docs/STRUCTURE.md` and durable `docs/**/*.md`
- package/config files
- source directories and major modules
- tests and examples
- `agent-work/features.yaml` and recent plans/history when present
- recent git history

Build a concise understanding of what the repo appears to be, who it serves, its maturity, core domain concepts, constraints, and terminology.

Do not treat code-inferred purpose, audience, or stage as final truth.

For a brand-new project with no code to investigate (e.g. invoked from `project-init`), skip repo exploration and build the hypothesis from the user's project description and session context.

### 2. Present Context Hypothesis

Before interviewing, summarize:

- **Likely purpose**
- **Likely target user**
- **Project type**: what kind of thing this is
- **Project stage**: maturity and usage context
- **Likely success criteria**
- **Operating assumptions / constraints**
- **Important domain terms**
- **Unclear or conflicting signals**
- **Suggested `CONTEXT.md` changes** when refreshing an existing file

Label uncertain claims as assumptions.

### 3. Alignment Checkpoint

Use the ask-user tool to ask whether the hypothesis is broadly right before continuing:

- **Mostly right** → run a gap-filling interview focused on missing, uncertain, or high-impact details.
- **Partly wrong** → ask the user to correct the core misunderstanding first, then continue with a targeted interview.
- **Mostly wrong** → discard the repo-derived framing and restart from first principles: purpose, user, stage, success, and language.

Do not proceed to write `CONTEXT.md` until the user confirms the working framing.

### 4. Context Interview

Interview as in `plan-md`: one decision question at a time, each with your recommended answer based on repo evidence and a one-line rationale; wait for feedback before the next. Resolve dependent topics in order — purpose → target user → project type/stage → success criteria → out of scope → operating assumptions → terminology (including synonyms agents should avoid and what should not be documented even if visible in code).

Ask only what the repo and the alignment checkpoint could not resolve; skip topics the user already confirmed. Stop when durable context is clear, not when the topic chain is exhausted.

Do not write `CONTEXT.md` until project meaning, audience, type, stage, assumptions, and terminology are clear enough.

### 5. Write or Refresh CONTEXT.md

Create or update root `CONTEXT.md` with:

- **Purpose**
- **Target User**
- **Project Type**
- **Project Stage**
- **Success Criteria**
- **Operating Assumptions**
- **Out of Scope**
- **Language**: project-specific terms, definitions, and avoided synonyms when useful

If updating an existing file, prefer precise edits over rewriting. Preserve good current content, remove stale context, and avoid duplicating `README.md` or `docs/STRUCTURE.md`.

Keep it durable. Do not include implementation history, temporary workflow notes, file indexes, or architecture details better suited for `docs/STRUCTURE.md`.

### Output

Report the `CONTEXT.md` path and include a `Summary:` line describing what was created or changed.
