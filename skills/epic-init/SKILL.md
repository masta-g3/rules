---
name: epic-init
description: Decompose a complex feature into trackable sub-features for an existing codebase.
argument-hint: "[epic description]"
disable-model-invocation: true
---

Assume `SKILLS_ROOT` is set per `AGENTS.md` before running helper commands.

Given the provided epic description, break it down into trackable sub-features for multi-session development.

If scope or boundaries are unclear, ask the user wit hthe user ask tool before proceeding.

### 1. Decompose Epic

Break down into **atomic features** — each with one testable outcome, completable in one session.

- Target **4-10 features**. Fewer = under-decomposed; 11+ = split into multiple epics.
- Each feature has a single "it works when..." statement. Group related work (e.g., CRUD, fetch+display).

Think through: foundation → core → integration → polish. Fold trivial setup into the first feature that needs it.

### 2. Create Epic Doc

Write `docs/plans/{epic}-000.md` — under ~20 lines: one-line goal, scope boundaries, key constraints, and planned feature IDs with one-line descriptions. Features reference this in `references`.

### 3. Generate Features

Choose a short epic prefix (e.g., `auth`, `cart`, `notif`). Check existing prefixes via `$SKILLS_ROOT/_lib/features_yaml.sh epics` — extend an existing epic if the work belongs there.

Register each feature through `ticket-init`. After creation, enrich with decomposition-specific fields:

```yaml
steps:
  - "Step to verify feature works"
priority: 1  # 1=foundation, 2=core, 3=polish
depends_on:
  - epic-001
references:
  - "docs/plans/{epic}-000.md"
```

### 4. Report

Summarize: epic prefix, feature count by priority, key dependencies, and recommended starting feature. Do not begin implementation — use `/next-feature` to select and `/plan-md` to plan.
