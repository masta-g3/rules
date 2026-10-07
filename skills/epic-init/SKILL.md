---
name: epic-init
description: Decompose a complex feature into trackable sub-features for an existing codebase.
argument-hint: "[epic description]"
---

Given the provided epic description, break it down into trackable sub-features for multi-session development.

If scope or boundaries are unclear, ask the user before proceeding.

### 1. Decompose Epic

Explore the code the epic touches first. Then break the epic into **vertical slices**: each ticket cuts a thin, complete path through every layer it needs and can be demonstrated or tested on its own. Each fits one session and has one "it works when..." outcome.

- Target **4-10 tickets**. 11+ means split into multiple epics.
- Put refactoring that makes later tickets easier first.
- For a wide mechanical change that breaks many call sites at once, add the new form beside the old, migrate callers in batches, then remove the old form, so each ticket stays green.
- Ticket only work you can state precisely now. Keep the rest under "Not yet specified" in the epic doc; do not pre-slice it.
- Add `depends_on` only when a ticket cannot start without another. Independent tickets can run in parallel.

### 2. Review the Breakdown

Show the user a numbered list: title, blocked by, and what it delivers. Ask whether the size feels right, whether each dependency is real, and whether any ticket should merge or split. Iterate until approved.

### 3. Create Epic Doc

Write `agent-work/plans/{epic}-000.md`, under ~30 lines, with no file paths or code:

- **Goal**: one line.
- **Acceptance criteria**: 3-5 checkable outcomes for the whole epic.
- **Decisions**: one line per confirmed design choice that spans tickets.
- **Test seams**: where the epic's behavior is tested; prefer existing, high-level seams.
- **Tickets**: ID, title, and one "it works when..." line each.
- **Not yet specified**: in-scope work too unclear to ticket.
- **Out of scope**: work ruled out, with a short reason.

The doc is an index: point to tickets and plans; do not repeat their detail.

### 4. Register Tickets

Choose a short epic prefix. Check existing prefixes via `$SKILLS_ROOT/_lib/features_yaml.sh epics` and extend an existing epic if the work belongs there.

Register each ticket through `ticket-init` in dependency order, adding `depends_on` (real blockers only) and `references: ["agent-work/plans/{epic}-000.md"]`. Use priority 1 for refactor and foundation tickets. Update the epic doc with the assigned IDs.

### Output

Summarize: epic prefix, ticket count, dependencies, and which tickets can start in parallel. Do not begin implementation. Next: `/next-feature` and `/plan-md` per ticket, or `workflow-orchestrator` in Pi to run the epic.
