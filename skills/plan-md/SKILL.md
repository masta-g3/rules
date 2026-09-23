---
name: plan-md
description: Create and maintain a Markdown implementation plan for a feature or task.
argument-hint: "[request]"
---

Create a detailed Markdown implementation plan for the provided request.

When available, call `set_workflow_step` with `stepId: "plan-md"` before starting this authorized step. Reading this skill alone does not update the indicator. Changing steps does not authorize additional work.

### Pre-Work & User Interview

The step starts with `inspecting-code`. Pi publishes `clarifying-requirements` automatically when `ask_user_question` starts. Do not make redundant activity calls for either boundary.

Open the interview by asking whether to isolate this work in a git worktree; the answer shapes where every later step runs. If approved, inspect the current and default branches. Ask which branch should seed the worktree, then which should receive the PR; recommend the default branch for both. Then investigate the codebase to resolve discoverable facts, and interview the user about the decisions that remain. Ask one decision question at a time, include your recommended answer and rationale, and wait for feedback before continuing. Use very simple and straightforward language. Be thorough about decisions that materially affect the plan. Resolve them in dependency order, one question at a time. Do not re-ask settled questions or ask about facts you can verify in the codebase. Ask what must be true for the work to count as complete. Suggest specific results the user can check, using plain, simple language. Write the plan only after the user confirms these acceptance criteria and shared understanding; never implement it during this skill.

Do not re-ask a worktree, start-branch, or PR-target decision that the user explicitly confirmed in the current request or that a parent orchestrator supplies as confirmed user input.

### Worktree (Only If The User Approved One)

Use one owner. If Hub supplied a worktree mapping, verify it and work there; do not create or register a second Rules-owned mapping. Otherwise use `$SKILLS_ROOT/_lib/worktrees.sh create` with one explicit JSON `--repo` argument per repository. The helper uses `AGENT_WORKTREES_DIR` (default `~/.local/share/agent-worktrees`) and creates a unique external task directory containing the durable `worktree.json` record and worktrees. Pass source, label, branch, base, integration target, and exactly one `primary` role. It never scans for or adopts existing worktrees.

For an existing approved worktree, use `$SKILLS_ROOT/_lib/worktrees.sh register` with its exact source, worktree, branch, target, role, and an optional absolute `--root`. Registration validates and preserves its location, including an explicitly approved legacy nested location. Never register a Hub-owned mapping. If adopting a nested checkout, verify that Git cannot stage it; do not add a blanket ignore rule for external worktrees.

Bind Pi to the exact returned record by passing `worktreeRecord` to `set_workflow_ticket` (or `/wf-ticket <id> <absolute-record-path>`). Other harnesses read the record's `authoredRoot` and run there. Put the sole plan and ticket update in that authored root. Do not create a duplicate plan in the source checkout. Copy only required untracked local configuration after explicit inspection; never record its contents.

### Plan File Location & Naming

Store plans in `agent-work/plans/`:

- If the request names a feature ID, use it. Otherwise create one with the `ticket-init` skill.
- Write the plan to `agent-work/plans/<feature-id>.md`, update `plan_file`, and call `set_workflow_ticket` when available:
  `$SKILLS_ROOT/_lib/features_yaml.sh update "<feature-id>" --json '{"plan_file":"agent-work/plans/<feature-id>.md"}'`
- Before replacing a tracked plan, inspect any nonempty legacy `steps`. Copy useful scope into the reviewed Markdown plan, then remove `steps` from YAML in the same reviewed mutation. Never remove legacy steps merely because a plan is linked.
- If `agent-work/features.yaml` does not exist, use `agent-work/plans/FEATURE_NAME.md`.
- Tracked features keep `status: pending`; `execute` owns the `pending` → `in_progress` transition.

### Context Files

Include a context-files section:

- **Core**: files directly modified or extended
- **Reference**: existing patterns to follow, related utilities or documents

### Create Plan

1. When available, call `set_workflow_activity` with `writing-plan`, then create the Markdown document. Start with:
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

7. Include `## Acceptance Criteria`: a checklist of outcomes that must be true for the ticket to be complete. Derive criteria only from user-confirmed requirements and constraints. Clarify any ambiguity that affects completion during the interview; do not introduce assumptions or expand scope. Technical verification details may come from code inspection, but must not change the agreed outcome. Map each criterion to a test or executable check in the relevant implementation phase.
   - Verify behavior with realistic inputs and edge cases. Check affected workflows end-to-end for side effects, with the smallest necessary impact area.
   - For migrations, releases, or stateful workflows, define the complete expected final state: exact or derived counts, identity continuity, date coverage, exclusions, preserved state, and allowed exceptions. Include post-apply read-back checks.

8. Note likely doc impacts as `Reflection Candidates` for `/reflect`.

### Plan Review (Non-Trivial Plans Only)

For plans involving architectural decisions, multi-file changes, or complex logic, invoke the **plan-critic** through `tmux_subagent`; Pi publishes `reviewing-plan` and increments its pass count from that exact launch. If fixes are needed, call `set_workflow_activity` with `updating-plan` when available before editing, then launch the critic again after fixes. For a non-tmux critic path only, call `reviewing-plan` manually as the fallback before each pass. Never use both paths for one pass. Act on feedback per the AGENTS.md critic rule.

### Output

For successful planning, call `set_workflow_activity` with `plan-ready` when available, report the plan path, include a `Summary:` line describing the approach, then a short **Complete when:** checklist summarizing all acceptance criteria in plain language. Preserve the agreed scope; introduce no new requirements. End with `READY FOR EXECUTE`. If planning is blocked, report `BLOCKED — <reason>`.
