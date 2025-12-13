---
argument-hint: [epic description]
description: Decompose a complex feature into trackable sub-features for an existing codebase.
---

Given the epic request: **$1**, break it down into trackable sub-features for multi-session development.

### 1. Gather Context

- Read `docs/STRUCTURE.md` (if present) for architecture and patterns
- Run `git log --oneline -10` for recent work context
- If `features.json` exists, extract epic prefixes and status counts via jq
- Identify relevant files/modules that this epic will touch

### 2. Decompose Epic

Break down into **atomic features**—each with one testable outcome, completable in one session.

**Sizing guardrails:**
- Target **4-10 features** per epic. Fewer = under-decomposed; 12+ = over-decomposed or split into multiple epics.
- Each feature should have a single "it works when..." statement. Multiple "and also..." = too big.
- Group related work (e.g., CRUD operations, fetch+display). Don't create features for boilerplate, glue code, or per-file tasks.

Think through: foundation → core functionality → integration → polish. Fold trivial setup into the first feature that needs it.

### 3. Determine Epic Prefix

**If `features.json` exists:**
- Extract existing epic prefixes via jq
- If this work extends an existing epic → use that prefix
- If new domain → choose a short, descriptive prefix (e.g., `sync`, `export`, `dash`)

**If `features.json` doesn't exist:** Create it as a root-level array `[{...}, ...]`. Choose prefix based on the epic's domain.

### 4. Generate Features

Create or append to `features.json` with entries following this schema:

```json
{
  "id": "{epic}-{nnn}",
  "description": "User can [action] with [context]",
  "steps": [
    "Step to verify feature works",
    "Another verification step"
  ],
  "status": "pending",
  "priority": 1,
  "depends_on": ["epic-001"],
  "discovered_from": null,
  "spec_file": null,
  "created_at": "YYYY-MM-DD"
}
```

Requirements:
- IDs sequential within epic (`sync-001`, `sync-002`, ...)
- Descriptions are action-oriented and testable
- Steps are concrete verification instructions
- Priority: 1=foundation, 2=core, 3=polish
- `status`: always `"pending"` here (lifecycle: `pending` → `in_progress` → `done`)
- `depends_on` explicitly lists blocking feature IDs
- `created_at` set to today's date

**If appending to existing `features.json`:**
Use jq to append without reading full file into context:
```bash
jq '. += [<new_features>]' features.json > tmp.$$ && mv tmp.$$ features.json
```

### 5. Report to User

Summarize:
```
EPIC: {prefix}
Features: {count} total
  - Priority 1 (foundation): {n}
  - Priority 2 (core): {n}
  - Priority 3 (polish): {n}

Dependency chain:
  {prefix}-001 → {prefix}-002 → {prefix}-003
                              ↘ {prefix}-004

Recommended start: {first-ready-feature-id}
```

List any assumptions made or clarifications needed before starting.

---

**Do not begin implementation.** This command only decomposes and registers work. Use `/next-feature` to select and `/plan-md` to plan implementation.
