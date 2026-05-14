# Proposal: Enhancing Agent Commands with Long-Running Agent Insights

Based on analysis of [Anthropic's "Effective harnesses for long-running agents"](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) (Nov 2025).

---

## Context

This repo defines a **4-step atomic feature workflow**:
1. **prime** → context gathering
2. **plan** → create implementation plan
3. **execute** → implement incrementally
4. **commit** → archive & commit

The article addresses **long-running agents** working across many context windows on large projects (e.g., building entire apps). Key distinctions:

| Aspect | Our Workflow | Article's Focus |
|--------|--------------|-----------------|
| Scope | Single atomic feature | Entire app (200+ features) |
| Sessions | Usually 1-2 context windows | Dozens of context windows |
| State | Plan doc + git | Progress file + feature JSON + git |

**Not all advice applies directly**, but several teachings can improve robustness.

---

## Systematic Evaluation

### 1. `prime.md` — Context Priming

**Current State:**
- Reads `docs/STRUCTURE.md`
- Understands architecture, components, philosophy
- Focuses on task-relevant sections

**Article Insights (Session Startup Ritual):**
```
1. Run pwd to see the directory you're working in
2. Read git logs and progress files to get up to speed
3. Read features list, pick highest-priority incomplete feature
4. Run basic end-to-end test before implementing
```

**Evaluation:**

| Article Practice | Applicable? | Notes |
|------------------|-------------|-------|
| Run `pwd` | ⚠️ Minor | Useful for orientation, low cost |
| Read git logs | ✅ Yes | Recent commits reveal context, active work |
| Read progress files | ⚠️ Conditional | Only if PROGRESS.md exists |
| Run basic test | ❌ No | Overkill for atomic features |

**Proposed Edit (Surgical):**

Add git log check and optional progress file reading:

```diff
 Read and thoroughly understand this codebase by examining @docs/STRUCTURE.md 
 (or similar documentation files), understanding its purpose, architecture, 
 components, and coding/design philosophy. We will be working on the following 
 task: "$1", so pay particular attention to sections that relate to this topic.
+
+Check the recent git history (`git log --oneline -10`) to understand what has 
+been recently worked on. If a PROGRESS.md file exists, read it for session 
+continuity context.
+
 Read relevant scripts and files to gather sufficient context about existing 
 patterns, components, design and implementation approaches. Once you have a 
 comprehensive understanding, prepare to discuss.
```

**Rationale:** Git logs provide immediate context about recent changes—especially useful when picking up someone else's work or resuming after a break. Low overhead, high signal.

---

### 2. `plan-md.md` — Planning

**Current State:**
- Creates detailed MD plan with phases
- Uses `[ ]` checkboxes for progress
- Scales detail by feature size (200+ lines for substantial, concise for minor)
- Waits for user approval before execution

**Article Insights:**
- Uses **structured JSON** for feature lists with explicit `passes: true/false`
- Strongly-worded: "unacceptable to remove or edit tests"
- Model less likely to inappropriately change JSON vs Markdown

**Evaluation:**

| Article Practice | Applicable? | Notes |
|------------------|-------------|-------|
| JSON feature list | ❌ No | For 200+ feature apps, not atomic features |
| Pass/fail tracking | ⚠️ Partial | Already have `[ ]`/`[x]` in phases |
| Prevent edits to tests | ⚠️ Minor | Could reinforce in execute.md |

**Proposed Edit:** None needed.

**Rationale:** The structured JSON with pass/fail is designed to prevent agents from declaring victory on *large projects* with hundreds of features. Our workflow already constrains scope to atomic features with human checkpoints. Markdown with checkboxes is appropriate for our use case.

---

### 3. `execute.md` — Implementation

**Current State:**
- Works from approved plan
- Iterates through phases incrementally
- Tests and seeks feedback before next phase
- Updates plan with `[x]` and divergences

**Article Insights:**
- Start session by verifying existing functionality still works
- Work on only **ONE feature at a time**
- Leave environment in **clean state** (mergeable to main)
- Git commit with descriptive messages after completing work

**Evaluation:**

| Article Practice | Applicable? | Notes |
|------------------|-------------|-------|
| Verify existing functionality | ✅ Yes | Prevents regression stacking |
| One feature at a time | ✅ Already | Plan phases enforce this |
| Clean state at end | ✅ Yes | Worth making explicit |
| Git commits during work | ⚠️ Partial | commit.md handles final; mid-work commits optional |

**Proposed Edit (Surgical):**

```diff
 Work directly from the active plan we have been discussing. If a planning 
 document is available, iterate through each phase incrementally—implement, 
 test, and seek user feedback before moving to the next phase. Mark completed 
 steps with `[x]` and update the plan if scope or approach shifts.
 
+Before implementing new functionality, verify that existing features affected 
+by your changes still work. If you discover broken state, fix it before 
+proceeding.
+
 While coding, adhere strictly to the minimalist philosophy originally outlined: 
 avoid hacks, fallback mechanisms, or any form of bloat. Keep implementations 
 clean, modular, and pattern-aligned.
+
+At the end of each phase, ensure the code is in a clean, reviewable state—no 
+half-implemented features, no commented-out debugging code, no broken imports.
 
 If the work touches UI or UX, follow the principles and best practices 
 championed by top research design labs.
```

**Rationale:** The article emphasizes that agents often leave code in broken/half-done states between sessions. Explicit instruction to verify existing functionality and leave clean state prevents regression stacking.

---

### 4. `commit.md` — Archive & Commit

**Current State:**
- Archives planning doc to `docs/history/yyyymmdd_feature_spec.md`
- Structured git commit format (headline + bullets)
- Updates `docs/STRUCTURE.md` if needed
- Does not push

**Article Insights:**
- Write progress summaries for next session
- Git commits with descriptive messages (already done)
- Leave environment ready for next agent

**Evaluation:**

| Article Practice | Applicable? | Notes |
|------------------|-------------|-------|
| Progress file update | ⚠️ Conditional | PROGRESS.md already in user rules |
| Descriptive commits | ✅ Already | Format is solid |
| Clean state verification | ✅ Yes | Could add explicit check |

**Proposed Edit (Surgical):**

```diff
 Archive the planning document first (if present):
 
 Before committing, if a markdown planning file exists for this feature 
 (e.g., FEATURE.md or similar), transform it into a permanent feature spec 
 under docs/history/yyyymmdd_feature_spec.md. Reformat as lightweight 
 documentation: remove implementation details, bloated content, and keep 
 the completed checklist at the end as a summary. Verify the date via terminal.
 
+Verify clean state before committing:
+
+Ensure no debugging artifacts remain (console.logs, print statements, 
+commented-out code blocks, TODO markers for this feature). The commit 
+should represent code ready for review/merge.
+
 Commit all files modified during this session:
```

**Rationale:** Explicitly checking for debugging artifacts before commit prevents the "unclean state" problem the article identifies. Small addition, meaningful improvement.

---

### 5. `prechecks.md` — Deployment Readiness

**Current State:**
- Comprehensive static checks, build, env, DB, API validations
- Reports only blockers
- Does not alter functionality

**Article Insights:**
- End-to-end testing with browser automation
- Test as a human user would

**Evaluation:**

| Article Practice | Applicable? | Notes |
|------------------|-------------|-------|
| Browser automation testing | ❌ No | This is deployment check, not feature test |
| E2E testing emphasis | ⚠️ Separate concern | Could be separate command |

**Proposed Edit:** None needed.

**Rationale:** This command is specifically for deployment readiness checks (CI/CD parity), not feature testing. The article's browser automation advice would belong in a separate testing-focused command or in execute.md for UI features.

---

## New Workflow Consideration: Full App Development

The article's core teachings are optimized for building **entire applications from scratch** over many context windows. This is a different workflow than our atomic feature approach.

### Suggested New Workflow: `fullapp-*`

For greenfield "build me an app" requests, consider a separate command set:

| Command | Purpose |
|---------|---------|
| `fullapp-init.md` | Initializer agent: setup project, create feature JSON, init.sh, initial git |
| `fullapp-iterate.md` | Coding agent: pick one feature, implement, test E2E, commit, update progress |
| `fullapp-status.md` | Review progress: show feature pass/fail status, recent commits |

**Key differences from atomic workflow:**

1. **Feature JSON** (not Markdown):
   ```json
   {
     "category": "functional",
     "description": "User can create new chat",
     "steps": ["Navigate to main", "Click new chat", "Verify creation"],
     "passes": false
   }
   ```

2. **Progress file** (`app-progress.txt`):
   - What was done last session
   - Current blockers
   - Next priority feature

3. **Startup ritual** in each iterate:
   - Run init.sh to start dev server
   - Run basic E2E test (verify app loads)
   - Read progress file
   - Pick highest-priority failing feature

4. **E2E testing** with browser automation before marking features complete

**Recommendation:** Implement this as a separate workflow, not modifications to the atomic feature commands. The contexts are different enough to warrant separation.

---

## Summary of Proposed Changes

### Immediate Edits (Atomic Feature Workflow)

| File | Change | Impact |
|------|--------|--------|
| `prime.md` | Add git log check, optional PROGRESS.md read | Low risk, improves context |
| `execute.md` | Add verify-before-implement, clean-state-at-end | Prevents regression stacking |
| `commit.md` | Add clean state verification before commit | Catches debugging artifacts |

### Future Work (Separate Workflow)

| Item | Description |
|------|-------------|
| `fullapp-init.md` | New initializer agent command |
| `fullapp-iterate.md` | New coding agent command |
| `fullapp-status.md` | New status review command |

---

## Decision Matrix

| Article Teaching | Already Applied | Add to Atomic | Add to Full App |
|------------------|-----------------|---------------|-----------------|
| Structured progress tracking | ✅ Plan checkboxes | - | ✅ JSON + progress.txt |
| Git history for context | Partial | ✅ prime.md | ✅ |
| Incremental phases | ✅ execute.md | - | ✅ |
| Clean state before commit | Partial | ✅ execute.md, commit.md | ✅ |
| Feature list with pass/fail | - | - | ✅ Feature JSON |
| E2E browser testing | - | - | ✅ Puppeteer/MCP |
| init.sh startup script | - | - | ✅ fullapp-init |
| One feature at a time | ✅ Plan phases | - | ✅ Strict enforcement |

---

## Next Steps

1. **Review this proposal** with user
2. **Apply surgical edits** to prime.md, execute.md, commit.md
3. **Decide on full app workflow** — implement if needed
4. **Archive** this proposal once decisions are made


