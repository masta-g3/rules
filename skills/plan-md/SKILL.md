---
name: plan-md
description: Create and maintain a Markdown implementation plan for a feature or task.
argument-hint: "[request]"
---

Create a detailed Markdown implementation plan for the provided request.

Only start planning when authorized by the user. Reading this skill does not authorize work.

### Runtime integration

#### Pi

When the tools are available:
- Before starting, call `set_workflow_step` with `stepId: "plan-md"`. Changing the indicator does not authorize additional work.
- Once the ticket is identified, call `set_workflow_ticket`. For an approved Rules-owned worktree, bind the exact returned record through `worktreeRecord`.
- The initial activity is `inspecting-code`; `ask_user_question` publishes `clarifying-requirements`. Do not duplicate these signals.
- Call `set_workflow_activity` with `writing-plan` before drafting, `updating-plan` before critic-driven edits, and `plan-ready` before the successful report.
- Launch `plan-critic` through `tmux_subagent`; Pi publishes `reviewing-plan` and increments the pass count. Only for a non-tmux launch, publish `reviewing-plan` manually before each pass. Never do both.

#### Worktree tooling

For agent-managed creation or registration, read [the worktree helper reference](../_lib/worktrees.md). If a host such as Hub supplies a mapping, verify and use it without creating or registering a Rules record.

### Planning

Open the interview by asking whether to isolate this work in a git worktree; the answer shapes where every later step runs. If approved, inspect the current and default branches. Ask which branch should seed the worktree, then which should receive the PR; recommend the default branch for both.

Answer questions from the codebase where possible; do not ask the user to supply those facts. Ask the user about choices that affect scope, behavior, architecture, dependencies, or data safety. Ask one question at a time in plain language, recommend an answer with a reason, and wait. Resolve dependent decisions in order without re-asking settled questions. Ask again when research, drafting, or review uncovers an unresolved decision.

Start the plan file once the initial scope is clear. Keep confirmed decisions and open questions there so the user can inspect the draft. Revise it in place as decisions settle, preserving exact limits, exclusions, and guarantees. Show the proposed behavior or approach with a short example, flow, or mockup before detailing implementation. Ask what must be true for the work to count as complete, and propose specific, checkable results. Before marking the plan ready, resolve open questions and confirm the approach and these acceptance criteria with the user. Remove obsolete draft notes; retain confirmed decisions. Never silently change confirmed decisions or implement during this skill.

Do not re-ask a worktree, start-branch, or PR-target decision that the user explicitly confirmed in the current request or that a parent orchestrator supplies as confirmed user input.

### Worktree (Only If The User Approved One)

Use one verified worktree location and owner. Keep the plan and ticket updates there, not in both checkouts. If the supplied location or ownership cannot be verified, stop and report the blocker rather than creating a replacement.

Reuse externally managed worktrees without taking ownership. Never commit a nested checkout. Copy only necessary untracked local configuration after inspecting it; never include its contents in plans or logs.

### Plan File Location & Naming

Store plans in `agent-work/plans/`:

- If the request names a feature ID, use it. Otherwise create one with the `ticket-init` skill.
- Write the plan to `agent-work/plans/<feature-id>.md` and update `plan_file`:
  `$SKILLS_ROOT/_lib/features_yaml.sh update "<feature-id>" --json '{"plan_file":"agent-work/plans/<feature-id>.md"}'`
- Before replacing a tracked plan, inspect any nonempty legacy `steps`. Copy useful scope into the reviewed Markdown plan, then remove `steps` from YAML in the same reviewed mutation. Never remove legacy steps merely because a plan is linked.
- If `agent-work/features.yaml` does not exist, use `agent-work/plans/FEATURE_NAME.md`.
- Tracked features keep `status: pending`; `execute` owns the `pending` → `in_progress` transition.

### Context Files

Include a context-files section:

- **Core**: files directly modified or extended
- **Reference**: existing patterns to follow, related utilities or documents

### Create Plan

1. Start the Markdown document with:
   - `**Feature:** {id} → {canonical title}` — repeated for readability; `features.yaml.title` remains authoritative
   - `**Session:** {harness session ID}`
   - `**Worktree:** {path(s) and branch, or `none`}` — later steps run wherever this points
   - `**Start branch:** {branch per repository, or `n/a`}`
   - `**PR target:** {branch per repository, or `n/a`}`

2. Inventory what already exists before designing: the code that owns this behavior, plus the architecture, libraries, utilities, and conventions the codebase already uses for this class of problem. Default to composing existing pieces, then brainstorm alternatives and pick the fundamental approach with the smallest surface area.

   Identify code, checks, and references the change makes unnecessary. Plan their removal before additions where safe, and design only for demonstrated needs.

3. Include a `## Reuse` section listing the existing components, patterns, and dependencies the plan builds on, with file paths. Any new abstraction, library, or pattern needs a one-line justification of why the existing option is inadequate.

4. Write a detailed implementation plan (code snippets, file paths, architecture layout with components, data flows, and dependencies). Scale depth to complexity; use pseudocode, diagrams, and breakdowns as needed.

5. If UI work, include a design direction section. Brainstorm with the `frontend-designer` subagent if available. Specify theme tokens, typography, and color choices centrally — no scattered magic values.

6. Under `## Implementation Phases`, divide work into incremental test-first phases (foundation → core → polish). Use `### Phase <number>: <short title>` headings, with actionable `[ ]` checkboxes directly under each phase, including its final verification. Write/update the failing test first, make the smallest passing change, then refactor. The `execute` skill marks completed actions with `[x]`. Move deferred work to `Discovered Work` or rewrite it as a plain note; do not leave it as an unchecked actionable item.

7. Include `## Acceptance Criteria`: a checklist of outcomes, not tasks, that must be true for the work to be complete, derived only from user-confirmed requirements and constraints. Map each criterion to a test or executable check in the relevant implementation phase. Code inspection may inform verification, but must not change the agreed outcome.
   - Verify behavior with realistic inputs and edge cases. Check affected workflows end-to-end for side effects, with the smallest necessary impact area.
   - For migrations, releases, or stateful workflows, define the complete expected final state: exact or derived counts, identity continuity, date coverage, exclusions, preserved state, and allowed exceptions. Include post-apply read-back checks.

8. Note likely doc impacts as `Reflection Candidates` for `/reflect`.

### Plan Review (Non-Trivial Plans Only)

For plans involving architectural decisions, multi-file changes, or complex logic, invoke **plan-critic** using the available subagent mechanism. Act on feedback per the AGENTS.md critic rule; rerun after material changes.

### Output

For successful planning, report the plan path, include a `Summary:` line describing the approach, then a short **Complete when:** checklist summarizing all acceptance criteria in plain language. Preserve the agreed scope; introduce no new requirements. End with `READY FOR EXECUTE`. If planning is blocked, report `BLOCKED — <reason>`.
