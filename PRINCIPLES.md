> *Controlling complexity is the essence of computer programming.*

- **Stay under ~70% context.** Compact at a sensible cut-off when approaching the 50% mark.
- **One task per session.** Single problem, single ticket. Peripheral work surfaced along the way gets logged as a new ticket, never pursued inline.
- **Don't delegate design.** Agents are good for execution and brainstorming, but not for architecture or system design — that's a weak spot.
- **Agents drift local.** They produce semi-duplicate code, reinvent utilities, and ignore global patterns and conventions. Counter with explicit guidelines and review agents.
- **Enforce minimalism.** Agents love producing code → bloated codebase. Instruct for the smallest viable solution.
- **Agents default to Java-brain.** Heavy OOP, big classes, needless abstractions. Override deliberately — I push functional to keep it in check.
- **Agents code defensively.** Default values to dodge missing-value errors, backward-compat shims left after signature changes. Both hide bugs and grow the codebase. Instruct for fail-fast and no-compat by default.
- **Kill sideways sessions.** Once an agent is off-track it digs in, doesn't recover. Restart with better context beats steering it back.
- **Commit at known-good.** Checkpoint often so you can bail cleanly when things go sideways.
- **Explicit beats implicit.** Agents deliver sharper work when you hand them explicit tests and checklists — they'll iterate until green. Lean on this hard. Verify the artifact anyway.
- - **Don't be a pushover.** Agents flip positions the instant you (or sub-agents) challenge them. Tell them to hold ground when they have reason.