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

Use the user ask tool to ask whether the hypothesis is broadly right before continuing:

- **Mostly right** → run a gap-filling interview focused on missing, uncertain, or high-impact details.
- **Partly wrong** → ask the user to correct the core misunderstanding first, then continue with a targeted interview.
- **Mostly wrong** → discard the repo-derived framing and restart from first principles: purpose, user, stage, success, and language.

Do not proceed to write `CONTEXT.md` until the user confirms the working framing.

### 4. Context Interview

Use the user ask tool to confirm assumptions and fill gaps. Ask as many rounds as needed, but avoid one giant questionnaire; prefer focused batches of 3-4 questions. For unclear projects, expect a substantial interview, but stop when the durable context is clear.

Cover:

1. What the project is
2. Why it exists
3. What success looks like
4. Primary and secondary users
5. Project type
6. Project stage / maturity / usage context
7. What is explicitly out of scope
8. Durable constraints and operating assumptions
9. Domain concepts and relationships
10. Project-specific terminology
11. Synonyms or framings agents should avoid
12. What should not be documented even if visible in code
13. Strategic or product truths not inferable from the repo

When useful, include the recommended answer based on repo evidence and ask the user to confirm or correct it.

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
