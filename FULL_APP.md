# Full App Development Workflow

A structured workflow for building entire applications from scratch over multiple context windows, based on [Anthropic's research on long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents).

---

## The Problem

When asked to "build an app," agents fail in predictable ways:

1. **One-shotting**: Tries to build everything at once, runs out of context mid-implementation, leaves features half-done
2. **Premature completion**: Sees some progress, declares victory too early
3. **Broken handoffs**: New context window starts with no memory of what happened, wastes time guessing

## The Solution

Combine big-picture planning with the existing atomic workflow:

```
┌─────────────────┐     ┌─────────────────────────────────────────────────────┐
│  fullapp-init   │────▶│  fullapp-next → prime → plan → execute → commit     │
│  (Agent A)      │     │  (Agent B, then Agent C, then Agent D, ...)         │
│  once           │     │  one feature per agent                              │
└─────────────────┘     └─────────────────────────────────────────────────────┘
        │                                      │
        ▼                                      ▼
   - features.json                      - Pick next feature
   - Project scaffold                   - Understand context (prime)
   - Initial commit                     - Plan implementation
                                        - Execute with review
                                        - Commit + update features.json
```

**Key insight:** `fullapp-init` creates the backlog (`features.json`), then each subsequent agent uses the existing atomic cycle (`prime → plan → execute → commit`) to implement one feature at a time.

---

## Core Artifact

### `features.json` — Feature Backlog with Pass/Fail Tracking

Comprehensive list of all features the app requires. Each feature has explicit pass/fail status.

```json
[
  {
    "id": "auth-001",
    "category": "authentication",
    "description": "User can sign up with email and password",
    "steps": [
      "Navigate to signup page",
      "Enter valid email and password",
      "Submit form",
      "Verify account created",
      "Verify redirect to dashboard"
    ],
    "passes": false,
    "priority": 1
  },
  {
    "id": "auth-002",
    "category": "authentication", 
    "description": "User can log in with existing credentials",
    "steps": [
      "Navigate to login page",
      "Enter valid credentials",
      "Submit form",
      "Verify redirect to dashboard",
      "Verify session persists on refresh"
    ],
    "passes": false,
    "priority": 1
  }
]
```

**Rules:**
- Features are marked `"passes": false` until verified end-to-end
- Only change the `passes` field after thorough testing
- It is unacceptable to remove or edit feature descriptions—this leads to missing or buggy functionality. Only modify with explicit user approval.
- Priority 1 = foundation, Priority 2 = core, Priority 3 = polish

---

## Commands

### `fullapp-init.md` — Project Setup (Agent A)

```markdown
---
argument-hint: [app description]
description: Initialize a new full app project with features.json backlog for multi-session development.
---

Given the app request: **$1**, set up the foundation for multi-session development.

### 1. Analyze Requirements

Break down the request into a comprehensive feature list. Think through:
- Core functionality (what makes this app work?)
- Authentication/authorization (if applicable)
- Data models and relationships
- User flows and interactions
- Edge cases and error states

Aim for completeness—it's easier to defer features than discover them mid-build.

### 2. Create Project Structure

Initialize the project with appropriate tooling:
- Choose minimal, modern stack aligned with requirements
- Set up version control with initial commit
- Create dependency manifest with pinned versions

### 3. Generate `features.json`

Create in project root. Example:

```json
[
  {
    "id": "auth-001",
    "category": "authentication",
    "description": "User can sign up with email and password",
    "steps": [
      "Navigate to signup page",
      "Enter valid email and password",
      "Submit form",
      "Verify account created",
      "Verify redirect to dashboard"
    ],
    "passes": false,
    "priority": 1
  },
  {
    "id": "auth-002",
    "category": "authentication",
    "description": "User can log in with existing credentials",
    "steps": [
      "Navigate to login page",
      "Enter valid credentials",
      "Submit form",
      "Verify session persists on refresh"
    ],
    "passes": false,
    "priority": 1
  }
]
```

Requirements:
- Unique IDs (category-nnn format)
- Clear descriptions testable by a human
- Step-by-step verification instructions
- Priority levels (1=foundation, 2=core, 3=polish)
- All `passes: false` initially

### 4. Initial Commit

```bash
git add .
git commit -m "Initialize project with features.json backlog

- features.json: [N] features across [M] categories
- [Stack/framework] project scaffold"
```

### 5. Report to User

Summarize:
- Total feature count by category
- Recommended first feature to implement
- Any clarifying questions before starting

---

**Coding Philosophy:**
- Choose minimal, proven technologies—no experimental dependencies
- Prefer convention over configuration
- Structure for maintainability from day one
- If building UI: plan for beautiful, distinctive aesthetics (not generic "AI slop")
```

---

### `fullapp-next.md` — Feature Selection (Start of Agent B/C/D cycle)

```markdown
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
Verification steps:
- [step 1]
- [step 2]
- ...

Ready to proceed with prime → plan → execute → commit cycle.
```

```

---

## Workflow Example

```
User: "Build me a Claude.ai clone"

Agent A (fullapp-init):
├── Analyze: 200+ features across auth, chat, settings, etc.
├── Create: Next.js project, Tailwind, database schema
├── Generate: features.json with all features
└── Commit: "Initialize project with features.json backlog"

Agent B (fullapp-next → prime → plan → execute → commit):
├── fullapp-next: Select auth-001 (user signup), verify baseline
├── prime: Read codebase, understand patterns
├── plan: Create AUTH_SIGNUP.md with implementation plan
├── execute: Implement signup form, API route, database insert
└── commit: "Implement auth-001: User signup" + update features.json

Agent C (fullapp-next → prime → plan → execute → commit):
├── fullapp-next: Select auth-002 (user login), verify auth-001 still works
├── prime: Read codebase, understand auth patterns
├── plan: Create AUTH_LOGIN.md with implementation plan
├── execute: Implement login form, session handling
└── commit: "Implement auth-002: User login" + update features.json

... repeat with new agents until all features pass ...
```

---

## Integration with Atomic Workflow

The full app workflow **extends** the atomic workflow rather than replacing it:

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `fullapp-init` | Create features.json backlog | Once, at project start |
| `fullapp-next` | Pick next feature from backlog | Start of each feature cycle |
| `prime` | Understand codebase context | After feature selection |
| `plan` | Create implementation plan | After priming |
| `execute` | Implement the feature | After plan approval |
| `commit` | Commit + update features.json | After implementation |

**For projects without features.json** (single features, refactors, fixes): use `prime → plan → execute → commit` directly. The `commit` command will only update `features.json` if it exists and a feature was being worked on.

