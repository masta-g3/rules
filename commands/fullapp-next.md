---
description: Select the next feature to implement from features.json and prepare for the atomic cycle.
---

### 1. Review State

- Read `docs/STRUCTURE.md` (if present) to get a general sense of the app
- Read `features.json` to see all features and their pass/fail status
- Run `git log --oneline -10` to understand recent work (or docs/history if more details are needed)

### 2. Baseline Verification

Quick smoke test to confirm project isn't broken—keep this minimal:
- **Web apps**: Start dev server, verify homepage loads
- **Libraries/packages**: Run `npm test` or equivalent, verify it passes
- **CLI tools**: Run one basic command, verify exit code 0
- **Pipelines**: Run on smallest sample data

One test that tells you "proceed" or "broken"—don't spend time on comprehensive verification here.

**If broken state found**: Stop and report to user. Do not attempt to fix automatically—wait for user guidance.

### 3. Select Feature

Pick from features with `passes: false`:
1. Start with highest priority (1 before 2 before 3)
2. Within same priority, consider dependencies—pick a feature whose prerequisites already pass
   - Example: "send message" likely depends on "user can log in"
   - If unsure whether a feature can be implemented yet, ask user before proceeding

Report to user:

```
NEXT FEATURE: [feature-id]
Description: [description]
Priority: [1/2/3]
```

