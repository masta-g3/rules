---
name: workflow-orchestrator
description: Parent-controlled ticket workflow automation using persistent subagents, one ticket at a time or in parallel isolated worktrees.
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
- `$SKILLS_ROOT` set for helper commands, e.g. Pi: `export SKILLS_ROOT="$HOME/.pi/agent/skills"`.

## Core rule

Do **not** give a child subagent the whole workflow. Give it one phase only:

```text
plan-md → execute → review → reflect → commit
```

After each child response, the parent inspects the output, changed files, git status, and handoff label before deciding the next phase.

## Ticket flow

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

To process several tickets, repeat this mode per next actionable feature (new child per ticket) within the boundary the user set — epic prefix, ticket count, or stop-on-first-failure — then summarize completed, blocked, and remaining work.

## Parallel tickets

Only when the user explicitly asks to run independent tickets in parallel, follow `references/parallel-worktrees.md` in this skill directory: worktree isolation, prompt boundaries, extra inspection gates, and the merge-back procedure.

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
- commit phase produced a commit hash and left no staged ticket files.

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
- the requested ticket boundary or user-defined limit is reached.

Do not stop just to provide routine progress updates.

## Domain-specific validation tools

Use specialized validation tools only when the ticket's domain requires them. Examples include browser automation for web UI flows, API clients for endpoint changes, database queries for data migrations, or device/simulator checks for hardware workflows.

Do not require every child to report availability for unrelated tools. Ask about a tool only when it is relevant to the ticket's validation contract.

## Child lifecycle

- Use one persistent child per ticket.
- Reuse that child for every phase of that ticket via `send(..., wait: true)` when available.
- Kill/stop the child after `WORKFLOW COMPLETE`, `BLOCKED`, `FAILED`, or unsafe drift.
- Do not let children orchestrate tickets or workflow phases through nested subagents.
- Children may launch only explicitly allowed nested specialist agents for the current phase. Nested agents must not stage, commit, merge, push, or modify files unless the phase prompt explicitly allows it.
- Require the child to report whether each expected nested specialist was used or skipped, plus the nested job ID/result path and which feedback was accepted/rejected.

## Final output

Report:

- ticket ID;
- final status;
- commit hash if complete;
- validation summary;
- blocked question or follow-up if any.

For multi-ticket runs, also report completed ticket IDs with commit hashes, blocked/skipped tickets with reasons, and the next recommended ticket.