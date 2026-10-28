**Feature:** workflow-001 → Stale workflow activity
**Session:** 01a17fbc-7578-740f-a631-c9f773d685a2
**Worktree:** none (`main`)

# Restore a reached done label on ready hand-back

## Problem

During plan-md, an `ask_user_question` start publishes `Clarifying scope` and clears the step's ✓, even after `Plan ready`. `hand_off` never touched activity, so the dashboard showed stale `Clarifying scope` beside a ready hand-back.

## Decisions (user-confirmed)

- Questions keep publishing `Clarifying scope`.
- `hand_off` kind `ready` restores the step's done label and ✓ (`Plan ready`, `Review complete`, `Reflection complete`) only if the step already reached it in the same step run. Side-request hand-backs mid-step never claim a false ✓.
- `blocked` hand-backs, Execute, and Commit (owned by `complete_workflow`) are unchanged.
- Install by copying only `extensions/workflow-runtime/`; do not run `sync-prompts.sh`, which would push the Pi-only AGENTS.md rule into Claude/Codex prompts.

## Implementation

- `core.ts`: `setWorkflowActivity` counts terminal publishes in `activityPasses` (pass display stays review-only); `restoreReachedDone` re-publishes the step's terminal activity when it was reached and is not current. Existing step/ticket resets clear the memory; ticket unlink keeps it like other step-run state.
- `index.ts`: `hand_off` ready calls `restoreReachedDone`.
- README: one clause in the fixed-activities bullet.
- Hand-off audit: no workflow skill calls `hand_off`; failure outcomes use `blocked`.

## Verification

- New extension test covers plan and review restore, blocked and side-request hand-backs, and a new step run; one existing `activityPasses` expectation updated.
- `uv run pytest`: 90/90; code-critic found no issues. Installed `~/.pi/agent/extensions/workflow-runtime` matches the repo; Claude/Codex prompts untouched.

## Follow-up

- Extension-only install friction is linked to `prompts-001` (Pi-only guidance isolation).
