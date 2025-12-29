---
argument-hint: [project description]
description: Initialize a new project with scaffolding for multi-session development.
disable-model-invocation: true
---

Given the project request: **$1**, set up the foundation for multi-session development.

### Clarify Before Scaffolding

Ensure you understand the user's vision before making architectural decisions—what problem it solves, who it's for, any tech preferences or constraints. Ask clarifying questions if needed (you can use the AskUserQuestion tool for this if available). Early architectural decisions are costly to change.

### 1. Create Project Structure

Initialize the project with appropriate tooling:
- Choose minimal, modern stack aligned with requirements
- Set up version control
- Create dependency manifest with pinned versions
- Create minimal `README.md` (project name, brief description, how to run)
- Create empty `features.json` (`[]`) in project root

### 2. Create `docs/STRUCTURE.md`

The living vision document that guides all subsequent work. Include:

- **Vision**: project purpose, target users, core experience
- **Tech stack**: technologies chosen and why
- **Architecture**: component diagram, file structure, data flow
- **Data models**: key schemas/entities (can be skeletal initially)
- **Key patterns**: code conventions, error handling, state management

For UI projects, also include:
- **Navigation/flows**: user journeys, state diagrams
- **Design direction**: color palette, typography, visual patterns

STRUCTURE.md captures the *why* and *how*—detailed enough that any engineer can implement correctly. It evolves as the project grows.

### 3. Initial Commit

Commit the scaffolding with a message like:
```
Initialize project structure

- docs/STRUCTURE.md: architecture and vision
- Empty features.json for backlog tracking
- [Stack/framework] scaffold
```

### 4. Report to User

Summarize what was created and recommend next step:

```
Project initialized: [name]
Stack: [technologies]
Structure: README.md, docs/STRUCTURE.md, features.json

Next: Run /epic-init "[first epic description]" to decompose your first batch of work.
```

List any assumptions made or clarifications needed.

---

**Do not decompose features here.** This command only scaffolds the project. Use `/epic-init` to define epics and populate features.json.
