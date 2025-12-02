# Parallel Agents: Worktree-Based Feature Isolation

Plan for enabling multiple AI agents to work on different features simultaneously using git worktrees.

---

## Two Modes

| Mode | Trigger | Workflow |
|------|---------|----------|
| **Standalone** | No `features.json` | Direct: plan → execute → commit (simple, no worktrees) |
| **Feature-driven** | `features.json` exists | Worktree: next-feature → (wt) plan/execute/commit → (main) finalize |

**Detection:** Agent checks if `features.json` exists in project root.

- **No features.json** → standalone mode, work directly
- **features.json exists** → feature-driven mode, use worktrees

---

## Why Worktrees for Feature-Driven?

When `features.json` exists:
- Multiple agents may work in parallel
- features.json coordinates who's working on what
- Worktrees provide isolated working directories
- Clean merge path back to main

When no `features.json`:
- Single agent, ad-hoc work
- No coordination needed
- Worktrees would be overhead without benefit

---

## Architecture (Feature-Driven)

```
Main repo (coordinator):
├── features.json (source of truth)
├── src/...
└── docs/...

../wt-auth-001/ (agent 1)
├── .git (file → points to main)
├── src/auth/...
└── auth-001.md

../wt-chat-001/ (agent 2)
├── .git (file → points to main)
├── src/chat/...
└── chat-001.md
```

**Key principle:** features.json lives ONLY in main. Worktrees are code-only.

---

## Workflow (Feature-Driven)

### Phase 1: Claim Work (in main)

```
/next-feature

Agent:
1. Reads features.json, selects ready feature (auth-001)
2. Updates features.json: auth-001 → "in_progress"
3. Commits to main (claim visible to other agents)
4. Creates worktree: git worktree add ../wt-auth-001 -b feat/auth-001
5. Reports:

   CLAIMED: auth-001
   Worktree: ../wt-auth-001
   Branch: feat/auth-001

   Next: cd ../wt-auth-001
   Then: /plan-md "auth-001: description"
```

### Phase 2: Do Work (in worktree)

```
cd ../wt-auth-001

/plan-md "auth-001: user can sign up"
# Creates auth-001.md

/execute
# Implements feature
# Discovered work noted in plan only (not features.json)

/commit
# Commits code only
# Reports: "Run /finalize auth-001 in main when ready"
```

### Phase 3: Finalize (back in main)

```
cd /path/to/main

/finalize auth-001

Agent:
1. Merges feat/auth-001 (reports conflicts if any)
2. Archives auth-001.md to docs/history/
3. Updates features.json: status → "done", spec_file set
4. Adds discovered work from plan to features.json
5. Commits
6. Removes worktree and branch
7. Reports: FINALIZED: auth-001
```

---

## Command Changes

### next-feature.md

**If features.json exists:** After selecting feature, claim and create worktree.

```markdown
### 3. Claim and Create Worktree

1. Update features.json: status → "in_progress"
2. Commit: `git commit -am "Claim {id}"`
3. Create worktree: `git worktree add ../wt-{id} -b feat/{id}`

Report:
```
CLAIMED: [id]
Worktree: ../wt-[id]
Branch: feat/[id]

Next: cd ../wt-[id]
Then: /plan-md "[id]: [description]"
```
```

---

### plan-md.md

```markdown
### Plan File Naming

Check if `features.json` exists in project root.

**Feature-driven (features.json exists):**
- If in worktree: use feature ID from current work → `{id}.md`
- If in main with tracked feature: use that ID → `{id}.md`
- If in main, untracked work: auto-register → `{new-id}.md`

**Standalone (no features.json):**
- Name after feature → `FEATURE_NAME.md`
```

---

### execute.md

```markdown
### Mode Detection

Check if `features.json` exists in project root.

**Feature-driven (in worktree):**
- Status already "in_progress" (set during /next-feature)
- Do NOT update features.json (lives in main)
- Note discovered work in plan document only:
  ```markdown
  ## Discovered Work
  - [ ] {id}.1: Description (blocks/parallel)
  ```
- Keep changes modular to reduce merge conflicts
- Avoid modifying shared files unless necessary

**Standalone (no features.json):**
- Work directly, no worktree considerations
```

---

### commit.md

```markdown
### Mode Detection

Check if `features.json` exists in project root.

**Feature-driven (in worktree):**
- Commit code changes only
- Do NOT archive plan (happens in /finalize)
- Do NOT update features.json (lives in main)
- Report: "Committed. Run /finalize {id} in main when ready."

**Standalone (no features.json):**
- Archive plan to docs/history/yyyymmdd_{name}.md
- Commit all changes
- Report: "Committed and archived."
```

---

### NEW: finalize.md

```markdown
---
argument-hint: [feature-id]
description: Merge feature branch to main, update tracking, cleanup worktree.
---

Finalize feature **$1** from main worktree.

### Prerequisites
- Must run from main (features.json must exist here)
- Worktree ../wt-$1 must exist

### Steps

1. **Merge feature branch:**
   ```bash
   git merge feat/$1
   ```
   If conflicts: stop, report to user, do not auto-resolve.

2. **Archive plan:**
   - Copy `../wt-$1/$1.md` to `docs/history/$1.md`
   - Transform to spec (remove implementation details)

3. **Update features.json:**
   - Set status → "done"
   - Set spec_file → "docs/history/$1.md"
   - Parse "Discovered Work" from plan, add entries

4. **Commit:**
   ```bash
   git commit -am "Finalize $1"
   ```

5. **Cleanup:**
   ```bash
   git worktree remove ../wt-$1
   git branch -d feat/$1
   ```

6. **Report:**
   ```
   FINALIZED: [id]
   Merged: feat/[id] → main
   Archived: docs/history/[id].md
   ```
```

---

## Conflict Prevention

For feature-driven mode, add to execute.md:

```markdown
### Minimizing Merge Conflicts

- Keep changes modular and targeted to the feature's scope
- Avoid modifying shared files (utils, configs) unless necessary
- If shared files must change, make minimal, surgical edits
- Prefer adding new files over modifying existing shared ones
```

---

## Race Condition Handling

Two agents claim same feature simultaneously:

```
Agent 1: updates features.json, commits → succeeds (claimed)
Agent 2: updates features.json, commits → fails (conflict)
Agent 2: pulls, re-reads features.json, selects next available
```

First commit wins. Agents handle failure by re-selecting.

---

## Discovered Work

In worktree, agent notes discovered sub-tasks in plan document:

```markdown
## Discovered Work
- [ ] auth-001.1: Email validation helper (blocks current)
- [ ] auth-001.2: Password strength check (parallel)
```

During `/finalize`, agent parses this section and adds entries to features.json with `discovered_from` set.

---

## Summary

**Two modes based on features.json existence:**
- No features.json → standalone, simple direct work
- features.json exists → worktree-based, parallel-safe

**Command behavior:**
- `next-feature`: claim + create worktree (if features.json)
- `plan-md`: create plan, naming based on mode
- `execute`: work, note discovered items in plan (not features.json if in worktree)
- `commit`: code only in worktree, full commit in standalone
- `finalize`: merge, archive, update tracking, cleanup (feature-driven only)

**Key principle:** features.json is coordination point, lives in main only.
