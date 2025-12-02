# Parallel Agents: Worktree-Based Feature Isolation

Plan for enabling multiple AI agents to work on different features simultaneously using git worktrees.

---

## Problem Statement

Current system is single-agent: one feature at a time, sequential execution. For complex projects with many independent features, parallel execution would speed up development.

**Challenges:**
- Multiple agents need isolated working directories
- features.json must remain the single source of truth for coordination
- Merge conflicts must be minimized and handled gracefully
- Agents need to detect their context (main vs worktree)

---

## Solution: Git Worktrees

Git worktrees provide isolated working directories linked to the same repo. Each worktree can be on a different branch, changes don't affect others until merged.

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

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MAIN WORKTREE                            │
│  ┌─────────────────┐                                            │
│  │ features.json   │ ← source of truth                          │
│  │ - auth-001: in_progress                                      │
│  │ - chat-001: in_progress                                      │
│  │ - data-001: pending                                          │
│  └─────────────────┘                                            │
└─────────────────────────────────────────────────────────────────┘
          │                              │
          │ claim + create               │ claim + create
          ▼                              ▼
┌──────────────────────┐      ┌──────────────────────┐
│  ../wt-auth-001/     │      │  ../wt-chat-001/     │
│  branch: feat/auth-001│      │  branch: feat/chat-001│
│  Agent 1 working...  │      │  Agent 2 working...  │
└──────────────────────┘      └──────────────────────┘
          │                              │
          │ finish                       │ finish
          ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        MAIN WORKTREE                            │
│  Merge feat/auth-001, update features.json → done               │
│  Merge feat/chat-001, update features.json → done               │
│  Remove worktrees, delete branches                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Workflow Phases

### Phase 1: Claim Work (in main worktree)

```bash
# 1. Select ready feature
/next-feature --parallel

# Agent does:
# - Reads features.json, selects auth-001
# - Updates: auth-001.status = "in_progress"
# - Commits to main (claim is now visible to other agents)
# - Creates worktree:
git worktree add ../wt-auth-001 -b feat/auth-001

# - Reports:
#   CLAIMED: auth-001
#   Worktree: ../wt-auth-001
#   Branch: feat/auth-001
#   Next: cd ../wt-auth-001 && /plan-md "auth-001: ..."
```

### Phase 2: Do Work (in feature worktree)

```bash
cd ../wt-auth-001

/plan-md "auth-001: user can sign up"
# Creates auth-001.md, no features.json changes

/execute
# Implements feature
# NO features.json updates (already claimed in main)
# Discovered work noted in plan document only

/commit
# Commits code only
# NO features.json changes
# NO archiving (happens in finalize)
```

### Phase 3: Finalize (back in main worktree)

```bash
cd /path/to/main

/finalize auth-001

# Agent does:
# - git merge feat/auth-001 (report conflicts if any)
# - Move auth-001.md to docs/history/auth-001.md
# - Update features.json: status → "done", spec_file → path
# - Add discovered work to features.json (if any noted in plan)
# - Commit
# - git worktree remove ../wt-auth-001
# - git branch -d feat/auth-001
# - Report: FINALIZED: auth-001
```

---

## Worktree Detection

Agent can detect context using git:

```bash
# Check if in worktree (worktrees have .git as file, not directory)
if [ -f .git ]; then
    echo "In worktree"
    # Get main repo path
    cat .git | grep gitdir | cut -d' ' -f2 | sed 's|/.git/worktrees/.*||'
else
    echo "In main repo"
fi

# Or use git directly
git worktree list  # shows all worktrees
git rev-parse --show-toplevel  # current worktree root
```

---

## Command Changes

### next-feature.md

Add `--parallel` flag handling:

```markdown
### Parallel Mode (if --parallel flag or worktree workflow)

After selecting feature:
1. Update features.json: status → "in_progress"
2. Commit: `git commit -am "Claim auth-001 for parallel work"`
3. Create worktree: `git worktree add ../wt-{id} -b feat/{id}`
4. Report:
   ```
   CLAIMED: [id]
   Worktree: ../wt-[id]
   Branch: feat/[id]
   Next: cd ../wt-[id] && /plan-md "[id]: [description]"
   ```
```

### execute.md

Add worktree-aware behavior:

```markdown
### Worktree Mode

Detect via `test -f .git` (worktrees have .git as file).

If in worktree:
- Skip features.json status update (already claimed in main)
- Note discovered work in plan document only (not features.json)
- Keep changes modular and targeted to reduce merge conflicts
- Avoid modifying shared files unless necessary
```

### commit.md

Add worktree-aware behavior:

```markdown
### Worktree Mode

If in worktree (`test -f .git`):
- Commit code changes only
- Do NOT update features.json (lives in main)
- Do NOT archive plan document (happens in finalize)
- Report: "Committed in worktree. Run /finalize {id} in main to complete."
```

### NEW: finalize.md

```markdown
---
argument-hint: [feature-id]
description: Merge worktree branch back to main and complete feature tracking.
---

Finalize feature **$1** by merging its worktree branch and updating tracking.

### Prerequisites

- Must be run from main worktree (not from a feature worktree)
- Feature must be in "in_progress" status
- Worktree ../wt-{id} must exist

### Steps

1. **Verify context:**
   - Confirm in main repo: `test -d .git`
   - Confirm worktree exists: `git worktree list | grep wt-$1`

2. **Merge feature branch:**
   ```bash
   git merge feat/$1
   ```
   If conflicts: stop, report to user, do not auto-resolve.

3. **Archive plan document:**
   - Copy from worktree: `cp ../wt-$1/$1.md docs/history/$1.md`
   - Transform to spec (remove implementation details, keep checklist)

4. **Update features.json:**
   - Set status → "done"
   - Set spec_file → "docs/history/$1.md"
   - Add any discovered work noted in plan document

5. **Commit:**
   ```bash
   git add docs/history/$1.md features.json
   git commit -m "Finalize $1: merge feature and update tracking"
   ```

6. **Cleanup:**
   ```bash
   git worktree remove ../wt-$1
   git branch -d feat/$1
   ```

7. **Report:**
   ```
   FINALIZED: [id]
   Branch merged, worktree removed
   Spec archived: docs/history/[id].md
   ```
```

---

## Conflict Prevention

Add to execute.md for worktree mode:

```markdown
### Minimizing Merge Conflicts

When working in a worktree:
- Keep changes modular and targeted to the feature's scope
- Avoid modifying shared files (utils, configs, base components) unless necessary
- If shared files must change, make minimal, surgical edits
- Prefer adding new files over modifying existing shared ones
- This reduces merge conflict likelihood when finalizing
```

---

## Race Condition Handling

**Scenario:** Two agents run `/next-feature --parallel` simultaneously, both select auth-001.

**Solution:** First agent to commit claims the work.

```
Agent 1: selects auth-001, updates features.json
Agent 1: git commit → succeeds, auth-001 claimed

Agent 2: selects auth-001, updates features.json
Agent 2: git commit → fails (features.json changed upstream)
Agent 2: git pull, re-reads features.json
Agent 2: auth-001 now in_progress, selects next available (auth-002)
```

The commit acts as an atomic claim. Agents should handle commit failure gracefully by re-selecting.

---

## Discovered Work in Worktrees

When agent discovers sub-tasks (e.g., auth-001.1) while in worktree:

1. **Note in plan document:**
   ```markdown
   ## Discovered Work
   - [ ] auth-001.1: Email validation helper (blocks auth-001)
   ```

2. **Do NOT update features.json** (lives in main)

3. **During finalize:**
   - Parse discovered work from plan document
   - Add entries to features.json in main
   - Set discovered_from: "auth-001"

---

## Implementation Phases

### Phase 1: Foundation
- [ ] Create finalize.md command
- [ ] Add worktree detection to execute.md
- [ ] Add worktree detection to commit.md
- [ ] Add --parallel mode to next-feature.md

### Phase 2: Integration
- [ ] Update FEATURES_PLUS.md with parallel workflow
- [ ] Update README.md with parallel section
- [ ] Add conflict prevention guidance to execute.md

### Phase 3: Polish
- [ ] Test full parallel workflow with 2 agents
- [ ] Handle edge cases (orphaned worktrees, stale claims)
- [ ] Document recovery procedures

---

## Summary

**Key changes:**
- `next-feature --parallel`: claim + create worktree
- `execute` in worktree: skip features.json, note discovered work in plan
- `commit` in worktree: code only, no tracking updates
- **NEW** `finalize`: merge, archive, update tracking, cleanup

**Key principle:**
features.json is the coordination point. It lives in main only. Worktrees are isolated code sandboxes.

**Conflict strategy:**
Prevention (modular changes) + graceful handling (report to user, no auto-resolve).
