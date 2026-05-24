---
name: workflow-orchestrator
description: Parent-controlled ticket workflow automation using one persistent subagent per ticket, with single-ticket and backlog/epic sweep modes.
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
  - stopping the child when the ticket is complete or blocked.
- A clean or understood git worktree before starting each ticket.
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
3. Launch one persistent child for the ticket with `autoStopOnComplete: false` when using `tmux_subagent`.
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

## Preferred `tmux_subagent` control path

When `tmux_subagent` supports persistent follow-up actions, prefer the package API over raw tmux commands:

```text
launch: tmux_subagent({ agent, task: initialPhasePrompt, background: true, autoStopOnComplete: false })
advance: tmux_subagent({ action: "send", childId, message: nextPhasePrompt, wait: true, timeoutMs })
inspect: tmux_subagent({ action: "status", childId })
wait:    tmux_subagent({ action: "wait", childId, timeoutMs })
stop:    tmux_subagent({ action: "stop", childId })
```

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
- required final label.

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
- Kill/stop the child after `WORKFLOW COMPLETE`, `BLOCKED`, `FAILED`, or unsafe drift.
- Do not let children orchestrate their own subagent workflows. If a phase skill normally calls a reviewer subagent, either let the parent run that review separately or instruct the child to perform the review directly for single-child pilots.

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
