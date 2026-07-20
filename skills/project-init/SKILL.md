---
name: project-init
description: Initialize a new project with scaffolding for multi-session development.
argument-hint: "[project description]"
metadata:
  thinkingLevel: high
---

Given the provided project description, set up the foundation for multi-session development.

### Clarify Before Scaffolding

Ensure you understand the user's context and vision before making architectural decisions—what the project is, why it exists, who it's for, what kind of project it is, and any tech preferences or constraints. Ask clarifying questions if needed. Early context and architecture decisions are costly to change.

### 1. Create Project Structure

Initialize the project with appropriate tooling:
- Choose minimal, modern stack aligned with requirements
- Set up version control
- Create dependency manifest with pinned versions
- Create minimal `README.md` (project name, brief description, how to run)
- Create empty `agent-work/features.yaml` (`[]`)
- Create `agent-work/plans/`, `agent-work/history/`, and `agent-work/tickets/` for workflow artifacts

### 2. Create Durable Project Docs

Create root `CONTEXT.md` with the `context-md` skill: it owns the interview and document structure, and for a new project it builds its hypothesis from the user's description and this session's clarifications.

Create `docs/STRUCTURE.md` as the architecture and onboarding guide. Include:

- **Tech stack**: technologies chosen and why
- **Architecture**: component diagram, file structure, data flow
- **Data models**: key schemas/entities (can be skeletal initially)
- **Key patterns**: code conventions, error handling, state management

For UI projects, also include:
- **Navigation/flows**: user journeys, state diagrams
- **Design direction**: color palette, typography, visual patterns

`docs/STRUCTURE.md` captures the implementation *how*—detailed enough that any engineer can navigate and extend the project correctly. It evolves as the project grows, but should not contain implementation history or temporary workflow notes.

### 3. Initial Commit

Commit the scaffolding with a message like:
```
Initialize project structure

- CONTEXT.md: project purpose, audience, stage, and terminology
- docs/STRUCTURE.md: architecture and onboarding
- Empty agent-work/features.yaml for backlog tracking
- [Stack/framework] scaffold
```

### 4. Report to User

Summarize what was created and recommend next step:

```
Project initialized: [name]
Stack: [technologies]
Structure: README.md, CONTEXT.md, docs/STRUCTURE.md, agent-work/features.yaml

Next: Run /epic-init "[first epic description]" to decompose your first batch of work.
```

List any assumptions made or clarifications needed.

**Boundary:** this command only scaffolds; `/epic-init` decomposes features.
