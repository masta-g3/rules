# Features Plus: Enhanced Multi-Session Orchestration

Enhancements to the `features.json` system, integrating with the existing atomic workflow (prime → plan → execute → commit).

---

## Problem Statement

The current system has gaps:

1. **Implicit dependencies** — "consider dependencies" is handwavy
2. **Lost discovered work** — sub-tasks found mid-implementation aren't captured
3. **Binary state** — `passes: true/false` doesn't distinguish "not started" from "blocked"
4. **No plan linkage** — archived specs aren't connected to features
5. **Status timing unclear** — when exactly does a feature become "in progress"?
6. **No global ordering** — epic-based IDs don't show cross-epic chronology

---

## Two Modes of Operation

The system supports both:

**Mode A: Standalone** (no features.json)
```
/prime "add dark mode"
/plan-md "add dark mode"  → creates DARK_MODE.md
/execute                   → implements
/commit                    → archives to docs/history/yyyymmdd_dark_mode.md
```

**Mode B: Feature-driven** (with features.json)
```
/project-init "chat app"   → creates features.json
/next-feature              → selects auth-001, reports to user
/plan-md "auth-001"        → creates auth-001.md
/execute                   → sets in_progress, implements
/commit                    → sets done, archives to docs/history/auth-001.md
```

All commands work in both modes. Features.json operations are conditional.

---

## Enhanced Schema

### Current
```json
{
  "id": "auth-001",
  "category": "authentication",
  "description": "User can sign up",
  "steps": ["..."],
  "passes": false,
  "priority": 1
}
```

### Enhanced
```json
{
  "id": "auth-001",
  "description": "User can sign up",
  "steps": ["..."],
  "status": "pending",
  "priority": 1,
  "depends_on": [],
  "discovered_from": null,
  "spec_file": null,
  "created_at": "2024-01-15"
}
```

### Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | `{epic}-{nnn}` format (e.g., `auth-001`, `chat-002`) |
| `description` | string | What this feature does (testable statement) |
| `steps` | string[] | Verification steps for humans/agents |
| `status` | enum | `pending` / `in_progress` / `done` / `blocked` |
| `priority` | 1-3 | 1=foundation, 2=core, 3=polish |
| `depends_on` | string[] | IDs that must be `done` before this is ready |
| `discovered_from` | string? | Parent feature ID if discovered during implementation |
| `spec_file` | string? | Path to archived spec (set by commit) |
| `created_at` | string | Date created, `YYYY-MM-DD` format |

**Note:** `category` field removed. The epic is encoded in the ID prefix (`auth-001` → epic is `auth`). Group by parsing the prefix.

### ID Structure

```
{epic}-{story_number}

auth-001      ← first story in "auth" epic
auth-002      ← second story in "auth" epic
chat-001      ← first story in "chat" epic
auth-001.1    ← discovered sub-task of auth-001
```

The epic prefix is the conceptual grouping (like an epic in agile). The number is the story within that epic.

### Why `created_at`?

Epic-based IDs don't encode global order:
- `chat-001` might be created after `auth-003`
- Numbers only order within an epic

`created_at` enables:
- Global chronological sorting
- "What was added recently?" queries
- Session grouping (same date = likely same session)

Format is just date (`2024-01-15`), not full timestamp. Lightweight, sufficient.

### Status Values

- `pending` — Not started, waiting to be picked up
- `in_progress` — Actively being worked on (set by execute)
- `done` — Completed and verified (set by commit)
- `blocked` — External blocker (not dependency-related)

Unmet dependencies don't make a feature `blocked`—it's simply "not ready" and stays `pending`.

---

## Status Transition Points

Each command has specific responsibility for status changes.

```
┌─────────────────┐
│    pending      │ ← initial state (project-init or plan-md)
└────────┬────────┘
         │ execute.md starts work
         ▼
┌─────────────────┐
│  in_progress    │ ← active work happening
└────────┬────────┘
         │ commit.md completes
         ▼
┌─────────────────┐
│      done       │ ← verified complete
└─────────────────┘
```

| Command | Status Change | Rationale |
|---------|---------------|-----------|
| project-init | Sets all to `pending` | Initial state |
| next-feature | **No change** | Just selects and reports |
| plan-md | Creates entry as `pending` (if new) | Registers work |
| execute | `pending` → `in_progress` | Actual work begins |
| commit | `in_progress` → `done` | Work verified complete |

Why next-feature doesn't set `in_progress`:
- Selection ≠ commitment
- Planning might reveal the feature isn't ready
- `in_progress` means "code is being written"

---

## Plan File Naming & Linkage

### During Creation (plan-md)

| Mode | Plan File Name |
|------|----------------|
| Standalone | `FEATURE_NAME.md` (e.g., `DARK_MODE.md`) |
| Feature-driven | `{feature-id}.md` (e.g., `auth-001.md`) |

### During Archive (commit)

| Mode | Archive Path |
|------|--------------|
| Standalone | `docs/history/yyyymmdd_feature_name.md` |
| Feature-driven | `docs/history/{feature-id}.md` |

Why ID for feature-driven mode:
- Direct traceability: `auth-001` → `docs/history/auth-001.md`
- `spec_file` field makes it explicit
- Git history provides timing

### Spec File Linkage

After commit:
```json
{
  "id": "auth-001",
  "status": "done",
  "spec_file": "docs/history/auth-001.md",
  ...
}
```

Bidirectional traceability: feature ↔ spec.

---

## Auto-Registration in plan-md

When `features.json` exists but work isn't already tracked, plan-md auto-registers it.

**Logic:**

1. Extract existing epic prefixes (lightweight jq)
2. Semantically match new work to existing epic, or create new epic
3. Find next story number for that epic
4. Append entry with `status: "pending"`, `created_at: today`
5. Name plan file `{id}.md`

**Example:**

```
Existing epics: auth, chat
New work: "add emoji reactions to messages"

Agent infers: relates to "chat" epic
Next number: chat has chat-001, chat-002, chat-003 → next is chat-004
Creates: {"id": "chat-004", "created_at": "2024-01-15", ...}
Plan file: chat-004.md
```

No user prompts needed. Agent handles inference.

---

## Command Changes

### project-init.md

**Rename from:** `fullapp-init.md`

**Changes:**
- Update schema with new fields
- Add dependency thinking to requirements analysis
- Include `created_at` in generated entries

```markdown
### 3. Generate `features.json`

Create in project root:

```json
[
  {
    "id": "auth-001",
    "description": "User can sign up with email and password",
    "steps": [
      "Navigate to signup page",
      "Enter valid email and password",
      "Submit form",
      "Verify account created"
    ],
    "status": "pending",
    "priority": 1,
    "depends_on": [],
    "discovered_from": null,
    "spec_file": null,
    "created_at": "2024-01-15"
  }
]
```

Requirements:
- IDs use `{epic}-{nnn}` format
- Explicit `depends_on` for features requiring others first
- All `status: "pending"` initially
- `spec_file: null` initially (populated by commit)
- `created_at` set to creation date
```

---

### next-feature.md

**Rename from:** `fullapp-next.md`

**Key change:** Does NOT modify status. Selection only.

```markdown
### 3. Select Feature

Identify **ready** features—those where:
- `status` is `"pending"`
- All IDs in `depends_on` have `status: "done"`

From ready features:
1. Prefer highest priority (1 before 2 before 3)
2. If tied, prefer earlier `created_at`, then earlier ID

If no features are ready, report to user (don't guess).

Report selection:

```
NEXT FEATURE: [id]
Description: [description]
Priority: [priority]
Dependencies: [list or "none"]
Suggested plan file: [id].md
```

**Do not modify features.json.** Status changes happen in execute/commit.

### 4. Handoff to Planning

The next step is typically:
- `/plan-md "[id]: [description]"` to create the implementation plan
- Plan file will be named `[id].md` to maintain linkage
```

---

### plan-md.md

**Changes:** Auto-registration when features.json exists.

```markdown
1. **Determine context:**
   - If `features.json` exists and this work matches a tracked feature → use that ID
   - If `features.json` exists but work isn't tracked → auto-register (see below)
   - If no `features.json` → standalone mode

2. **Auto-registration (when features.json exists, work untracked):**
   - Extract existing epic prefixes via jq
   - Infer which epic this work belongs to (semantic match) or create new epic
   - Find next story number for that epic
   - Append entry: `status: "pending"`, `created_at: today's date`

3. **Create markdown document:**
   - Feature-driven: name it `{feature-id}.md` (e.g., `auth-001.md`)
   - Standalone: name it after the feature (e.g., `DARK_MODE.md`)

4. Brainstorm solutions, write detailed plan, add phased implementation...
```

No status changes. Planning is exploratory. Registration just creates the tracking entry.

---

### execute.md

**Changes:** Set `in_progress` at start, handle discovered work.

```markdown
Work directly from the active plan. Before starting implementation:

**If `features.json` exists and this implements a tracked feature:**
- Set the feature's `status` to `"in_progress"` via jq
- This is the commitment point—actual work is beginning

Iterate through each phase—implement, test, seek feedback. Mark completed steps with `[x]`.

### Discovered Work

During implementation, you may encounter sub-tasks not in the original plan.

**If `features.json` exists:**
1. Add discovered items immediately via jq:
   - ID: `{parent-id}.n` (e.g., `auth-001.1`)
   - `discovered_from`: parent feature ID
   - `status`: `"pending"`
   - `created_at`: today's date
2. Assess impact:
   - If it blocks current work → pause, work on discovered item first
   - If parallelizable → add to backlog, continue current work
3. Update the plan document with a "Discovered Work" section

**If standalone (no features.json):**
- Add a "Discovered Work" section to the plan document
- Decide with user whether to address now or defer

Never silently absorb scope—make all work visible.

### Phase Completion

At the end of each phase:
- Code is in clean, reviewable state
- No half-implemented features or debugging artifacts
- Plan document checkboxes updated
```

---

### commit.md

**Changes:** Set `done`, populate `spec_file`, conditional archive naming.

```markdown
### Archive Planning Document

If a markdown planning file exists for this work:

**Determine archive path:**
- Feature-driven: `docs/history/{feature-id}.md`
- Standalone: `docs/history/yyyymmdd_{feature_name}.md`

Transform into permanent spec: remove implementation details, keep completed checklist.

### Update features.json (if applicable)

If `features.json` exists and this session completed a tracked feature, use jq to:
1. Set `status` to `"done"`
2. Set `spec_file` to the archive path
3. Verify any discovered items are properly logged

### Commit

1. `git add` files worked on (including features.json if modified)
2. `git commit` with descriptive message
3. Do not push unless instructed

### Verify Documentation

Check if `docs/STRUCTURE.md` needs updates.
```

---

### prime.md

**Changes:** Add features.json awareness for context.

```markdown
Read and understand this codebase via `docs/STRUCTURE.md`.

**If `features.json` exists:**
- Use jq to extract summary: status counts, recent items by `created_at`
- Note which features are `done`, `in_progress`, `blocked`
- Understand dependency relationships for the target work

Check recent git history (`git log --oneline -10`) for context.

We will be working on: "$1"—pay attention to related sections.
```

---

## AGENTS.md Addition

Add this section to AGENTS.md:

```markdown
<features_json_operations>
When `features.json` exists, avoid reading the full file into context—it may contain
hundreds of entries. Use `jq` for lightweight extraction:

- Extract specific fields (epic prefixes, status counts, recent by created_at)
- Filter to relevant subset before reading details
- Update in-place with jq rather than read-modify-write in context

This keeps context lean for large projects. The agent knows jq syntax; apply the
principle of minimal extraction.
</features_json_operations>
```

---

## Discovered Work Protocol

When unexpected sub-tasks emerge during execute:

```
┌────────────────────────────────────┐
│  Implementing auth-001             │
│  ─────────────────────────         │
│  Discover: need email validation   │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│  Add to features.json:             │
│  {                                 │
│    "id": "auth-001.1",             │
│    "description": "Email valid.",  │
│    "discovered_from": "auth-001",  │
│    "created_at": "2024-01-15",     │
│    "status": "pending"             │
│  }                                 │
└──────────────┬─────────────────────┘
               │
               ▼
┌────────────────────────────────────┐
│  Does it block auth-001?           │
│  ├─ YES: work on auth-001.1 first  │
│  └─ NO: continue, address later    │
└────────────────────────────────────┘
```

Also add to plan document under "## Discovered Work" section.

---

## Readiness Algorithm

```python
def get_ready_features(features):
    done_ids = {f["id"] for f in features if f["status"] == "done"}

    ready = [
        f for f in features
        if f["status"] == "pending"
        and all(dep in done_ids for dep in f["depends_on"])
    ]

    # Sort by priority, then created_at, then ID
    ready.sort(key=lambda f: (f["priority"], f["created_at"], f["id"]))
    return ready
```

---

## Complete Workflow Example

```
Session 1: Initialize
─────────────────────
$ /project-init "task management app"

Creates:
- features.json with 15 features (all pending, created_at: 2024-01-15)
- Project scaffold
- Initial commit

Session 2: First Feature
─────────────────────────
$ /next-feature

Reports: "NEXT FEATURE: task-001 (Create a new task)"

$ /plan-md "task-001: user can create a new task"

Creates: task-001.md with implementation plan

$ /execute

- Sets task-001 status to "in_progress"
- Implements feature
- Discovers need for task-001.1 (input validation)
- Adds task-001.1 to features.json (created_at: 2024-01-15)
- Completes both

$ /commit

- Sets task-001 and task-001.1 to "done"
- Sets spec_file to "docs/history/task-001.md"
- Archives plan
- Commits

Session 3: Ad-hoc Work
──────────────────────
$ /plan-md "add dark mode toggle"

- features.json exists, work not tracked
- Agent infers: new epic "ui" or matches existing
- Auto-registers as ui-001 (created_at: 2024-01-16)
- Creates ui-001.md

$ /execute → /commit (normal flow)

Session 4: Next Planned Feature
───────────────────────────────
$ /next-feature

- Computes ready features
- Reports next selection
```

---

## Edge Cases & Guidance

### Abandoned / Failed Work

If work is started but abandoned (e.g., user pivots, feature deemed unnecessary):

- Reset `status` to `"pending"` if work might resume later
- Set `status` to `"done"` with empty `spec_file` and note in description if permanently dropped
- No `abandoned` status — keep schema simple

Stale `in_progress` items signal dropped work. The next session's `/next-feature` will surface them.

### Circular Dependencies

If circular dependency detected (A depends on B depends on A):

1. Report to user immediately
2. Do not attempt to break cycles automatically
3. User must manually edit `depends_on` to resolve

Agent should never guess at dependency resolution.

### Discovered Work Pruning

To prevent `{parent}.n` sprawl:

- If discovered item becomes irrelevant → set to `"done"` with note, or remove entirely if never started
- If multiple discovered items are related → merge into single feature
- Periodically review discovered items during `/next-feature`

---

## Mode Decision Tree

Single source of truth for how commands behave:

```
┌─────────────────────────────────────┐
│  Does features.json exist?          │
└──────────────┬──────────────────────┘
               │
       ┌───────┴───────┐
       │               │
      YES              NO
       │               │
       ▼               ▼
┌──────────────┐  ┌──────────────────┐
│ Feature-     │  │ Standalone Mode  │
│ driven Mode  │  │                  │
└──────┬───────┘  └────────┬─────────┘
       │                   │
       ▼                   ▼
┌──────────────────┐  ┌──────────────────┐
│ Is this work     │  │ Plan: NAME.md    │
│ already tracked? │  │ Archive: yyyymmdd│
└──────┬───────────┘  └──────────────────┘
       │
   ┌───┴───┐
   │       │
  YES      NO
   │       │
   ▼       ▼
┌────────┐ ┌─────────────────┐
│Use     │ │Auto-register:   │
│existing│ │infer epic,      │
│ID      │ │assign next num, │
└────────┘ │create entry     │
           └─────────────────┘
                   │
                   ▼
           ┌─────────────────┐
           │Plan: {id}.md    │
           │Archive: {id}.md │
           │spec_file: set   │
           └─────────────────┘
```

All commands check this tree. Status transitions and jq operations only apply in feature-driven mode.

---

## Summary

**Schema changes:**
- `status` (replaces `passes`) — richer state machine
- `depends_on` — explicit blockers
- `discovered_from` — tracks emergent work
- `spec_file` — links to archived specification
- `created_at` — global chronological ordering
- `category` removed — epic encoded in ID prefix

**Status transitions:**
- `next-feature`: no change (selection only)
- `plan-md`: creates entry as `pending` (if new work)
- `execute`: `pending` → `in_progress`
- `commit`: `in_progress` → `done` + set `spec_file`

**Auto-registration:**
- plan-md auto-registers untracked work when features.json exists
- Agent infers epic, finds next number, no user prompts

**Archive naming:**
- Feature-driven: `docs/history/{feature-id}.md`
- Standalone: `docs/history/yyyymmdd_{name}.md`

**Lightweight access:**
- Use jq for extraction, never read full JSON into context
- Principle documented in AGENTS.md
