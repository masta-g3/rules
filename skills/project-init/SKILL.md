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

### Context Interview

Before creating `CONTEXT.md`, ask enough focused questions to capture project context that cannot be inferred from files. Batch questions where possible, but avoid one huge questionnaire. Cover:

1. What is this project?
2. Why does it exist?
3. What does success look like?
4. Who is the primary target user?
5. What kind of project is this: production product, internal tool, personal utility, experimental PoC, library, prompt/workflow repo, etc.?
6. What stage is it in: solo prototype, active development, internal users, beta, commercial production, etc.?
7. What is explicitly out of scope?
8. What constraints or operating assumptions matter?
9. Which terms have project-specific meaning?
10. Which synonyms should agents avoid?
11. What should not be documented even if it appears in the codebase?

Use the answers to write a concise root `CONTEXT.md`. Do not infer project purpose, audience, stage, or terminology from code alone when the user has not provided it.

### 1. Create Project Structure

Initialize the project with appropriate tooling:
- Choose minimal, modern stack aligned with requirements
- Set up version control
- Create dependency manifest with pinned versions
- Create minimal `README.md` (project name, brief description, how to run)
- Create root `CONTEXT.md`
- Create empty `agent-work/features.yaml` (`[]`)
- Create `agent-work/plans/`, `agent-work/history/`, and `agent-work/tickets/` for workflow artifacts

### 2. Create Durable Project Docs

Create root `CONTEXT.md` as the project context document. Include:

- **Purpose**: why the project exists and what success looks like
- **Target user**: who the project primarily serves
- **Project type**: production product, internal tool, personal utility, experimental PoC, library, prompt/workflow repo, etc.
- **Project stage**: current maturity and usage context, e.g. solo prototype, active development, internal users, beta, commercial production
- **Operating assumptions**: durable constraints or principles that shape decisions
- **Language**: project-specific terms with tight definitions and `_Avoid_:` synonyms when useful

Create `docs/STRUCTURE.md` as the architecture and onboarding guide. Include:

- **Tech stack**: technologies chosen and why
- **Architecture**: component diagram, file structure, data flow
- **Data models**: key schemas/entities (can be skeletal initially)
- **Key patterns**: code conventions, error handling, state management

For UI projects, also include:
- **Navigation/flows**: user journeys, state diagrams
- **Design direction**: color palette, typography, visual patterns

`CONTEXT.md` captures the durable *why* and project language. `docs/STRUCTURE.md` captures the implementation *how*—detailed enough that any engineer can navigate and extend the project correctly. Both evolve as the project grows, but neither should contain implementation history or temporary workflow notes.

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

---

**Do not decompose features here.** This command only scaffolds the project. Use `/epic-init` to define epics and populate agent-work/features.yaml.
