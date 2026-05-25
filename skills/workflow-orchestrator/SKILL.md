---
name: workflow-orchestrator
description: Parent-controlled ticket workflow automation using persistent subagents, with single-ticket, backlog/epic sweep, and parallel isolated-worktree modes.
metadata:
  thinkingLevel: medium
---

Use this skill when the user explicitly asks the parent agent to manage the feature workflow automatically instead of waiting for manual invocation of each step.

The parent agent remains the orchestrator. Subagents execute exactly one workflow phase at a time and then stop for parent inspection.

## Requirements

- A tracked backlog at `agent-work/features.yaml` using the standard feature schema.
- Workflow skills available in the active harness: `next-feature`, `plan-md`, `execute`, `review`, `reflect`, `commit`.
- A persistent subagent mechanism, preferably `pi-tmux-subagents`, that supports:
  - launching one child per ticket;
  - sending follow-up prompts to the same child session;
  - waiting for a specific follow-up turn to complete;
  - reading child output/results;
  - optional allowlisted nested specialist launches from the child, when the phase skill or parent prompt explicitly calls for them;
  - stopping the child when the ticket is complete or blocked.
- A clean or understood git worktree before starting each ticket.
- For parallel ticket execution, isolated git worktrees and one branch per ticket.
- `$SKILLS_ROOT` set for helper commands, e.g. Pi: `export SKILLS_ROOT="$HOME/.pi/agent/skills"`.

## Core rule

Do **not** give a child subagent the whole workflow. Give it one phase only:

```text
plan-md → execute → review → reflect → commit
```

After each child response, the parent inspects the output, changed files, git status, and handoff label before deciding the next phase.

Skip `prime` by default for automation. Use `prime` only when the ticket is unusually unclear and the parent needs context before planning.

## Modes

### Mode A — One ticket

Use when the user names a ticket or asks to try the automation on the next ticket.

1. Select the ticket:
   - If the user supplied an ID, inspect it with `$SKILLS_ROOT/_lib/features_yaml.sh get <id> --output json`.
   - Otherwise run `$SKILLS_ROOT/_lib/features_yaml.sh next --output json` and use the recommended feature.
2. Verify the worktree is safe. Stop if unrelated changes make the commit boundary unsafe.
3. Launch one persistent child for the ticket with `autoStopOnComplete: false` when using `tmux_subagent`. Enable nested specialists only when needed with `allowNestedSubagents`, `nestedAgentAllowlist`, and `maxNestedDepth`.
4. Send exactly one phase prompt at a time:
   - `plan-md` for `<ticket-id>`; require `READY FOR EXECUTE`.
   - `execute` for `<ticket-id>` and `agent-work/plans/<ticket-id>.md`; require `READY FOR REVIEW`.
   - `review`; require `READY FOR REFLECT`.
   - `reflect`; require `READY FOR COMMIT`.
   - `commit`; require `WORKFLOW COMPLETE` and a commit hash.
5. Stop the child after completion or blockage.
6. Report only the final outcome unless the user asked for live updates or a stop condition occurs.

### Mode B — Sweep epic or backlog

Use when the user asks to process an epic or all actionable work.

1. Confirm or infer the sweep boundary:
   - specific epic prefix, e.g. `ux`;
   - all currently actionable features;
   - maximum ticket count;
   - time/cost limit;
   - stop after first failure.
2. Repeatedly select the next feature with the helper. Respect dependencies and in-progress work.
3. For each selected ticket, run Mode A from planning through commit with a new persistent child.
4. Do not provide progress updates between tickets unless requested. Continue until:
   - the requested ticket/epic/backlog boundary is complete;
   - no actionable features remain;
   - the ticket/time/cost limit is reached;
   - a stop condition occurs.
5. At the stopping point, summarize tickets completed, commits, skipped/blocked tickets, and the next recommended action.

### Mode C — Parallel tickets with isolated worktrees

Use when the user explicitly asks to try parallel ticket work or to maximize throughput across independent actionable tickets.

Never run two writable ticket agents in the same checkout. Parallel execution requires one git worktree, one branch, and one persistent child per ticket.

1. Choose tickets that are currently actionable and do not depend on each other. Do not pull blocked or dependent tickets forward just to hit a requested concurrency count.
2. If fewer independent tickets are ready than the requested parallel count, either run the smaller ticket set or use the spare slot for a read-only advisory/design/research subagent whose output is fed into relevant ticket phases.
3. Verify the main worktree is safe. Known ignored/untracked local artifacts are acceptable; unrelated tracked changes are a stop condition unless the user approves them.
4. Create isolated worktrees from the same base commit:
   ```text
   git worktree add -b agent/<ticket-id> <repo>.worktrees/<ticket-id> HEAD
   ```
5. Launch one persistent child per worktree with `cwd` set to that worktree and `autoStopOnComplete: false`. Enable nested specialists only with a narrow allowlist appropriate for the ticket/phase.
6. Include a worktree boundary in every child prompt:
   - work only in `<repo>.worktrees/<ticket-id>` on branch `agent/<ticket-id>`;
   - do not touch the main checkout or sibling worktrees;
   - commit locally on the ticket branch only;
   - do not push, merge, or clean up worktrees.
7. Advance each child through the normal phase gates independently. Parallelize waits/sends when possible, but inspect each completed phase before advancing that ticket.
8. If advisory/design output is required, launch it read-only from the parent and pass its result path into the affected ticket execute/review prompts.
9. After all selected tickets reach `WORKFLOW COMPLETE`, stop the children.
10. Merge back sequentially under parent control:
   - fast-forward or merge the first completed branch into main;
   - rebase each remaining ticket branch onto updated main in its own worktree;
   - if rebase/merge conflicts are mechanical and within scope, resolve and validate; otherwise stop for the user;
   - merge each rebased branch into main;
   - run full validation from main.
11. Remove worktrees and delete merged ticket branches only after main validation passes.

Expected conflicts are usually in `agent-work/features.yaml`, shared docs, tests, exports, and content indexes. Worktree isolation prevents runtime races, but the parent still owns merge order and conflict resolution.

## Preferred `tmux_subagent` control path

When `tmux_subagent` supports persistent follow-up actions, prefer the package API over raw tmux commands:

```text
launch: tmux_subagent({
  agent,
  task: initialPhasePrompt,
  background: true,
  autoStopOnComplete: false,
  allowNestedSubagents: true,
  nestedAgentAllowlist: ["plan-critic", "code-critic", "frontend-designer"],
  maxNestedDepth: 2
})
advance: tmux_subagent({ action: "send", childId, message: nextPhasePrompt, wait: true, timeoutMs })
inspect: tmux_subagent({ action: "status", childId })
wait:    tmux_subagent({ action: "wait", childId, timeoutMs })
stop:    tmux_subagent({ action: "stop", childId })
```

Use `allowNestedSubagents: true` only when the active phase may legitimately need specialists; otherwise omit it. Keep `nestedAgentAllowlist` to the smallest set needed for the ticket/phase. Common examples are `plan-critic` during `plan-md`, `code-critic` during `review`, and `frontend-designer` for UI planning/execution. Nested agents must remain advisory unless the parent prompt explicitly allows file edits.

Use `send(..., wait: true)` for normal phase advancement so the parent receives the completed turn result and avoids manual sleep/poll loops. Use raw `tmux paste-buffer` / `send-keys` only as a fallback when the installed package lacks `send`/`wait` support or the API is unavailable.

## Phase prompt contract

Each phase prompt to the child must include:

- ticket ID and description;
- exact skill file to read/follow for this phase;
- explicit boundary: "run only this phase";
- relevant plan path or prior handoff summary;
- project-specific constraints from `AGENTS.md`;
- validation expectations;
- instruction not to stage unrelated files;
- required final label;
- whether nested specialist subagents are allowed for this phase, the allowed agent names, and the requirement to report nested agent used/skipped, job ID/result path, and feedback accepted/rejected.

For Mode C, also include the exact worktree path, branch name, and instruction not to touch the main checkout or sibling worktrees.

Example phase boundary:

```text
Run ONLY the execute workflow step for tracked ticket <id>.
Do not run review, reflect, commit, archive, or mark the feature done.
Use and follow: <SKILLS_ROOT>/execute/SKILL.md.
End with READY FOR REVIEW if successful.
```

## Parent inspection gates

Before advancing, the parent checks:

- child final label matches the expected next step;
- no blocker/question was reported;
- child output and changed files still align with the approved plan and user intent;
- `git status --short` has only expected files plus known ignored/local artifacts;
- validation evidence is adequate for the phase;
- hardware/domain claims follow project rules;
- commit phase produced a commit hash and left no staged ticket files;
- in Mode C, the commit landed only on the child ticket branch and was not pushed or merged by the child.

If the label is missing or inconsistent, inspect the child transcript/result before proceeding.

## Stop conditions

Stop the workflow and notify the user when:

- the child asks a product, scope, architecture, hardware/domain, or commit-boundary question;
- tests or baseline validation fail and the fix is not clearly within the approved ticket scope;
- the worktree contains unrelated changes that make staging/commit unsafe;
- dependencies are blocked or no actionable tickets remain;
- parent inspection suggests the work rests on unresolved product/design ambiguity or no longer matches the approved plan/user intent;
- the child drifts outside the requested phase;
- a persistent subagent cannot be launched, resumed, inspected, or stopped reliably;
- the sweep boundary or user-defined limit is reached.

Do not stop just to provide routine progress updates.

## Domain-specific validation tools

Use specialized validation tools only when the ticket's domain requires them. Examples include browser automation for web UI flows, API clients for endpoint changes, database queries for data migrations, or device/simulator checks for hardware workflows.

Do not require every child to report availability for unrelated tools. Ask about a tool only when it is relevant to the ticket's validation contract.

## Child lifecycle

- Use one persistent child per ticket.
- Reuse that child for every phase of that ticket via `send(..., wait: true)` when available.
- In Mode C, bind each child to its worktree with the `cwd` launch parameter and repeat the worktree boundary in every follow-up prompt.
- Kill/stop the child after `WORKFLOW COMPLETE`, `BLOCKED`, `FAILED`, or unsafe drift.
- Do not let children orchestrate tickets or workflow phases through nested subagents.
- Children may launch only explicitly allowed nested specialist agents for the current phase. Nested agents must not stage, commit, merge, push, or modify files unless the phase prompt explicitly allows it.
- Require the child to report whether each expected nested specialist was used or skipped, plus the nested job ID/result path and which feedback was accepted/rejected.

## Final output

For one-ticket mode, report:

- ticket ID;
- final status;
- commit hash if complete;
- validation summary;
- blocked question or follow-up if any.

For sweep mode, report:

- completed ticket IDs and commit hashes;
- stopped/skipped/blocked tickets and reasons;
- remaining actionable count or next recommended ticket;
- whether the stop was normal boundary completion or needs user input.

For parallel worktree mode, also report:

- worktree paths and branch names used;
- per-ticket child/job IDs if useful for inspection;
- per-branch commit hashes before merge and final main commit hashes after merge/rebase;
- merge/rebase conflicts, resolutions, and final validation;
- whether worktrees/branches were cleaned up.
