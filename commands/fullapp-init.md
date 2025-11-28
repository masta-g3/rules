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
- Create `docs/STRUCTURE.md` with initial scaffold description
- Create minimal `README.md` (project name, brief description, how to run)

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
- Clear descriptions testable by a human and AI coding agents
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

