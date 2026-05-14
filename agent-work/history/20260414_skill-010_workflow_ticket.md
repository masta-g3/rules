# skill-010 — Pi workflow ticket context

## Outcome

Extended the Pi workflow indicator so it can remember an active workflow ticket, show that ticket beside the workflow rail, and keep the agent anchored to that ticket across later turns until cleared.

The shipped behavior stays explicit and minimal:

- workflow steps still drive the rail highlight
- ticket changes are user-controlled only
- only the active ticket is injected into turn context
- no `features.yaml` lookup or conversational heuristics were added

## Delivered

- Extended `extensions/workflow-indicator.ts` to persist `ticketId` alongside the active workflow step
- Added explicit ticket capture from `/skill:<step> <ticket>` when the ticket is supplied immediately after the skill name
- Added `/wf-ticket <ticket-id>` to set or override the active ticket manually
- Kept the current ticket sticky across later workflow steps that do not specify a new ticket
- Updated `/wf-clear` to clear both the visible rail state and the hidden ticket context
- Kept `new` blank, restored state on `startup` / `reload` / `resume`, and cleared state in forked sessions
- Rendered the active ticket beside the rail when a workflow step is visible, with compact fallback behavior for narrow widths
- Injected `Active workflow ticket: <ticket>` into the current turn's system prompt only when a ticket is active
- Documented `/wf-ticket`, explicit skill-ticket syntax, and fork clearing behavior in `README.md`

## Design Notes Kept in the Implementation

- Single-file extension only
- Single above-editor widget only
- Quiet typographic rendering using theme tokens
- Ticket is a user-controlled anchor, not autonomous workflow state
- Step is shown in UI but not persisted as hidden turn guidance

## Verification

Verified locally by:

- syncing prompts and loading Pi with the updated extension
- confirming explicit ticket capture from `/skill:prime engine-003`
- confirming sticky ticket carry-over across `/skill:plan-md`, `/skill:execute`, and `/skill:review`
- confirming manual override with `/wf-ticket engine-004`
- confirming `/wf-clear` removes both widget state and future ticket injection
- confirming `resume` restores the ticket and rail, while `fork` clears both and notifies
- confirming compact rendering remains one-line and theme-sensitive in targeted extension smoke tests

## Follow-up Notes

- `/wf-ticket <ticket-id>` activates ticket context immediately, even if no workflow step is currently visible in the rail
- explicit skill-based ticket capture is intentionally narrow: only the immediate argument after `/skill:<step>` is treated as a ticket
