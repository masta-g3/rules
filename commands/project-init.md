---
argument-hint: [project description]
description: Initialize a new project with features.json backlog for multi-session development.
---

Given the project request: **$1**, set up the foundation for multi-session development.

### 1. Analyze Requirements

Break down the request into a comprehensive feature list. Think through:
- Core functionality (what makes this project work?)
- Authentication/authorization (if applicable)
- Data models and relationships
- User flows and interactions
- Dependencies between features (what must exist before what?)
- Edge cases and error states

Aim for completeness—it's easier to defer features than discover them mid-build.

### 2. Create Project Structure

Initialize the project with appropriate tooling:
- Choose minimal, modern stack aligned with requirements
- Set up version control with initial commit
- Create dependency manifest with pinned versions
- Create minimal `README.md` (project name, brief description, how to run)

Create `docs/STRUCTURE.md` as the comprehensive vision document—the master plan that features.json references. Include:

- **Vision**: project purpose, inspiration, core experience
- **Tech stack**: technologies chosen and why, trade-offs considered
- **Architecture**: component diagram, file structure, data flow
- **Data models**: key dataclasses/schemas with code snippets
- **Navigation/flows**: state diagrams, user journeys (ASCII art if UI)
- **Screen mockups**: ASCII layouts for key screens (if UI)
- **Design system**: color palette, typography, visual patterns (if UI)
- **Key patterns**: code conventions, error handling approach, state management

At this stage there's little code—STRUCTURE.md captures the *why* and *how* that features.json can't. It should be detailed enough that any engineer can implement the vision correctly without further clarification.

### 3. Generate `features.json`

Create in project root. Example:

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
  },
  {
    "id": "auth-002",
    "description": "User can log in with existing credentials",
    "steps": [
      "Navigate to login page",
      "Enter valid credentials",
      "Submit form",
      "Verify session persists on refresh"
    ],
    "status": "pending",
    "priority": 1,
    "depends_on": ["auth-001"],
    "discovered_from": null,
    "spec_file": null,
    "created_at": "2024-01-15"
  }
]
```

Requirements:
- IDs use `{epic}-{nnn}` format (epic = conceptual grouping)
- Clear descriptions testable by humans and AI agents
- Step-by-step verification instructions
- Priority levels (1=foundation, 2=core, 3=polish)
- Explicit `depends_on` for features requiring others first
- All `status: "pending"` initially
- `created_at` set to today's date

### 4. Workflow Infrastructure (Claude Code only)

If you are running as **Claude Code** (identifiable by "Claude Code" in your system context and access to `.claude/settings.json` hooks):

1. Create `.claude/scripts/workflow.sh`:
   ```bash
   #!/bin/bash
   STATE=".claude/workflow.json"
   [[ ! -f "$STATE" ]] && exit 0
   NEXT=$(jq -r '.next // empty' "$STATE")
   FEATURE=$(jq -r '.feature // empty' "$STATE")
   [[ -z "$NEXT" ]] && exit 0
   if [[ "$NEXT" == "/prime" || "$NEXT" == "/plan-md" ]]; then
     CMD="$NEXT $FEATURE"
   else
     CMD="$NEXT"
   fi
   cat << EOF
   {"decision": "block", "reason": "AUTOPILOT: Run $CMD"}
   EOF
   ```

2. Create/merge `.claude/settings.json`:
   ```json
   {
     "hooks": {
       "Stop": [{"hooks": [{"type": "command", "command": "bash .claude/scripts/workflow.sh", "timeout": 5}]}]
     }
   }
   ```

3. Add `.claude/workflow.json` to `.gitignore`

If running in **Cursor, Codex, OpenCode, or another environment**: skip this step.

### 5. Initial Commit

```bash
git add .
git commit -m "Initialize project with features.json backlog

- features.json: [N] features across [M] epics
- [Stack/framework] project scaffold"
```

### 6. Report to User

Summarize:
- Total feature count by epic
- Recommended first feature (highest priority, no dependencies)
- Any clarifying questions before starting

---

**Coding Philosophy:**
- Choose minimal, proven technologies—no experimental dependencies
- Prefer convention over configuration
- Structure for maintainability from day one
- If building UI: plan for beautiful, distinctive aesthetics (not generic "AI slop")

