---
argument-hint: [feature-id]
description: Commit current state and create a worktree for parallel work.
disable-model-invocation: false
---

Claim feature **$1** for parallel work by committing and creating an isolated worktree.

### Prerequisites

- Must be in main repo (`test -d .git`), not already in a worktree
- Feature must be `in_progress` in features.yaml (i.e. `/plan-md` ran first)
- Plan file `docs/plans/$1.md` must exist

### Commit Current State

Stage and commit the plan file, features.yaml, and any other files modified during planning:

```bash
git add docs/plans/$1.md features.yaml
git commit -m "Claim $1 for parallel work"
```

This makes the claim visible to other agents immediately.

### Create Worktree

```bash
git worktree add ../wt-$1 -b feat/$1
```

Copy the plan file and symlink `.env` (if it exists) into the worktree:

```bash
cp docs/plans/$1.md ../wt-$1/
[ -f .env ] && ln -s "$(pwd)/.env" ../wt-$1/.env
```

### Report

```
CLAIMED: $1
Worktree: ../wt-$1
Branch: feat/$1
Next: cd ../wt-$1 && /execute
```
