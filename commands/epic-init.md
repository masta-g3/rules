---
argument-hint: [epic description]
description: Decompose a complex feature into trackable sub-features for an existing codebase.
disable-model-invocation: true
---

Given the epic request: **$1**, break it down into trackable sub-features for multi-session development.

### Clarify Before Decomposing

If the epic scope, boundaries, or constraints are unclear, ambiguous or too broad—ask the user before proceeding (you can use the AskUserQuestion tool for this if available). Decomposition errors are costly to fix later.

### 1. Decompose Epic

Break down into **atomic features**—each with one testable outcome, completable in one session.

**Sizing guardrails:**
- Target **4-10 features** per epic. Fewer = under-decomposed; 12+ = over-decomposed or split into multiple epics.
- Each feature should have a single "it works when..." statement. Multiple "and also..." = too big.
- Group related work (e.g., CRUD operations, fetch+display). Don't create features for boilerplate, glue code, or per-file tasks.

Think through: foundation → core functionality → integration → polish. Fold trivial setup into the first feature that needs it.

### 2. Generate Features

Choose a short, descriptive epic prefix (e.g., `auth`, `cart`, `notif`, `dash`). If `features.yaml` exists, extract existing prefixes via yq—extend an existing epic if this work belongs there, otherwise create a new prefix.

Create or append to `features.yaml` with entries following this schema:

```yaml
- id: "{epic}-{nnn}"
  description: "User can [action] with [context]"
  steps:
    - "Step to verify feature works"
    - "Another verification step"
  status: pending
  priority: 1
  depends_on:
    - epic-001
  discovered_from: null
  spec_file: null
  created_at: YYYY-MM-DD
```

Requirements:
- IDs sequential within epic (`sync-001`, `sync-002`, ...)
- Descriptions are action-oriented and testable
- Steps are concrete verification instructions
- Priority: 1=foundation, 2=core, 3=polish
- `status`: always `"pending"` here (lifecycle: `pending` → `in_progress` → `done`)
- `depends_on` explicitly lists blocking feature IDs
- `created_at` set to today's date

**If appending to existing `features.yaml`:**
Use yq to append without reading full file into context:
```bash
yq -i '. += [<new_features>]' features.yaml
```

### 3. Report to User

Summarize the decomposition: epic prefix, feature count by priority, key dependencies, and recommended starting feature. List any assumptions made or clarifications needed before starting.

---

**Do not begin implementation.** This command only decomposes and registers work. Use `/next-feature` to select and `/plan-md` to plan implementation.
