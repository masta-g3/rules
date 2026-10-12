---
name: workflow-orchestrator
description: Parent-controlled ticket workflow automation using persistent subagents, for one ticket or a set of tickets such as an epic, run in dependency order in isolated worktrees.
disable-model-invocation: true
---

Use this Pi-only skill only when the user asks the parent agent to run the feature workflow for them. The user aligns at kickoff, steps away, and reviews once at the end. The parent acts for the user in between, inside limits the user approved.

Launch each child as the `ticket-runner` agent. Requires `tmux_subagent` and `$SKILLS_ROOT` (`export SKILLS_ROOT="$HOME/.agents/skills"`).

## Core rule

The parent owns `plan-md` and orchestration. Each child owns one ticket from `execute` onward and runs one phase per turn:

```text
parent: plan-md → child: execute → review → reflect → commit
```

After each turn, the parent checks the gate before sending the next phase. Children never orchestrate tickets or phases.

Launch each child with `allowNestedSubagents: true` and `nestedAgentAllowlist: ["code-critic", "docs-critic"]`; the allowlist is fixed at launch.

## Kickoff (user present)

1. Select the tickets: the ones the user named, an epic, or `$SKILLS_ROOT/_lib/features_yaml.sh next --output json`. Read `depends_on` to know the order. For an epic, read its `{epic}-000.md` doc. With multiple tickets, pass its absolute path in the integration worktree in every phase prompt.
2. Confirm the start branch and PR target. For more than one ticket, the user's request to run them together approves an integration branch, its worktrees, pushing it, and one draft PR.
3. The parent runs `plan-md` for every ticket, including dependent ones, and interviews the user directly. Set up approved worktrees before planning there. Use read-only scouts for code facts; keep their summaries in context and read code only where needed. Follow `plan-md`, including plan-critic and user approval of acceptance criteria; write each plan in its ticket checkout. If a plan needs a human action, such as an account, credentials, or hardware, do it now with the user or mark that ticket parked.
4. Confirm the AFK limits. Default: the parent may answer from approved plans, make reversible implementation choices that keep acceptance criteria intact, and log discovered work as tickets. It may not change acceptance criteria, widen scope, add dependencies, or touch data or external systems.

Once its plan and AFK limits are approved and its dependencies are done, launch the ticket child at `execute`; it may work while the parent plans the next ticket. Do not launch children for tickets still waiting on dependencies.

## AFK (user away)

Handle each child question or reported deviation this way:

| Question or deviation | Parent action |
| --- | --- |
| The plan or AFK limits settle it | Answer with a pointer to the plan and continue. |
| Reversible judgment call | Take the child's recommendation, log it as decided for the user with the alternative, and continue. |
| Changes acceptance criteria or scope, or is not reversible | Park that ticket, queue the question, and continue the others. |

Read each plan's `Discovered Work` at every gate and log new items. Keep the decision log, discovered work, and parked questions in the draft PR body, or in the final report if no PR exists.

When a decision affects other tickets, add one line under the epic doc's Decisions, commit it on the integration branch, and tell affected running children to re-read it.

## Single ticket

After the parent finishes `plan-md`, launch one child at `execute` in the current checkout, or in the worktree that `plan-md` approved. Advance phases with `send(..., wait: true)`. The commit phase follows the commit skill, including any PR.

## Multiple tickets

Tickets run in `depends_on` order: a chain runs one at a time, and independent tickets run at once. Run at most 3 children at once, or the user's number.

1. Commit the ticket entries and the epic doc on the start branch, so every ticket branch sees the same backlog and epic doc. Create the integration branch `<epic>-integration` from the start branch in its own worktree, targeting the PR target. Create one worktree per ticket with branch `<ticket-id>`, based on and targeting the integration branch. Use `$SKILLS_ROOT/_lib/worktrees.sh create` (records under `AGENT_WORKTREES_DIR`) and keep each exact record path; reuse Hub-supplied mappings instead.
2. Launch a background child at `execute` for each approved, ready ticket, up to the limit, with `cwd` set to its worktree and `autoStopOnComplete: false`.
3. Before `execute`, the child merges the integration branch tip into its branch. Before reporting its commit, it merges the tip again and resolves conflicts in its own ticket.
4. Use `wait` without a `childId` to handle whichever child finishes next. Check its gate, then send its next phase.
5. After its commit, merge the ticket branch into the integration branch and push. Open the draft PR after the first merge. Then launch or resume tickets that just became ready.
6. When all tickets are merged, run `code-critic` on the integration diff against the PR target. Send the clear, high-impact findings to one child that fixes them in the integration worktree.
7. Mark the PR ready. After verifying each ticket merge, use `$SKILLS_ROOT/_lib/worktrees.sh remove` for Rules-owned ticket worktrees following `$SKILLS_ROOT/_lib/worktrees.md`, with the integration worktree as the surviving authored root; use Hub closeout for Hub-owned mappings. Keep the integration worktree until the user merges the PR.

Never run two writable children in one checkout. Do not merge into the PR target.

## Phase prompt

Send pointers, not restated context:

- ticket ID, phase skill path, plan path, and epic doc path if any (the integration worktree copy);
- worktree path and branch, and "do not touch other checkouts";
- "Run ONLY the <phase> step. End with the skill's final label.";
- for `commit` with multiple tickets: "Archive the plan, update the ticket, and commit to the ticket branch only. Do not push, open a PR, or clean up the worktree; the parent owns integration and closeout. Return COMMITTED FOR INTEGRATION with the commit hash instead of the commit skill's completion label.";

## Gate

Advance only when the expected phase label (or `COMMITTED FOR INTEGRATION` for a multi-ticket commit) is present, the diff matches the plan, required verification for the phase is complete, and `git status` in the child's worktree shows no surprises or unresolved questions. Before commit, acceptance checks must pass; only the user may approve deferring them.

A child turn that ends without the label, a question, or a blocker is a progress report, not a finished phase. If the child has no background work still running, reply by naming the open plan items and asking it to continue or state what blocks them. After two such replies in one phase, park the ticket.

Keep parent verification lightweight: read the child's summary, inspect diff scope and Git status, and check whether the evidence proves the agreed outcome through the highest practical existing seam, such as a CLI command, API, or user flow—not merely that implementation tests pass. Open relevant code or run a targeted check only for a gap, inconsistency, or cross-ticket risk. Do not repeat passing checks or load full transcripts by default; keep details in the plan and evidence files.

## Stop

Stop the run and report when tooling fails (a child cannot be launched, resumed, or stopped reliably), a validation failure falls outside approved scope, a child drifts outside its phase, the user's limit is reached, or only parked tickets remain. Stop each child when its ticket completes, parks, or fails.

## Report

- per ticket, by ID and title: status, commit hash, and parked question if any;
- PR URL and the integration worktree pending merge;
- decision log and discovered work;
- validation summary and next action.
