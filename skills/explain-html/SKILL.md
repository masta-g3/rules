---
name: explain-html
description: Create a self-contained, presentation-like HTML explanation for a concept, feature, change, refactor, architecture, or technical decision, whether it is already implemented or being proposed. Use when the user asks for an explainer, overview, walkthrough, conceptual/technical briefing, visual explanation, or HTML discussion artifact rather than a task checklist.
metadata:
  thinkingLevel: high
---

Create a polished HTML explanation, not an implementation plan.

The deliverable is a single self-contained `.html` file that reads like a concise technical briefing. Keep it grounded in source material and strip planning machinery: no phase checklists, no TDD steps, no execution instructions, no ticket lifecycle work unless the user explicitly asks.

## Workflow

1. **Ground the explanation.** Inspect the relevant source of truth: code, docs, plans, tickets, conversation context, or user-provided notes. Separate known facts from open questions. Ask the user only about blocking ambiguity (audience, scope, output location); otherwise choose the smallest useful scope.
2. **Get design direction.** Before building or materially changing layout/theme, invoke the `frontend-designer` subagent with the subject, audience, and content outline; ask for format, information hierarchy, and visual direction. If it is unavailable, continue with the bundled references and report a warning that design delegation was skipped.
3. **Choose the format by content**, guided by the design pass:
   - **Slide deck** — progressive walkthroughs and meeting-style discussion.
   - **Long-form article** — reference reading and deep single-topic explanations.
   - **Single canvas** — one focused proposal or system shape on one screen.

   Start with one strong view; add more only when progressive detail genuinely helps.
4. **Build the file.** `assets/explain-deck-template.html` is a known-good scaffold for the deck format — reuse or adapt its mechanics (theme tokens, keyboard nav, print CSS) freely, but take the visual direction from the design pass, not from the preset swaps. `references/component-library.md` offers proven content shapes for any layout; `references/explanation-patterns.md` covers narrative structure. Inline all CSS/JS, escape code snippets, keep the file offline-safe.
5. **Validate.** Confirm the file opens as valid HTML and meets the quality floor below.
6. **Run reader validation.** Ask a fresh subagent to view the rendered artifact as an audience member — not to inspect the source. What did it understand, is that correct, what felt confusing? Fix clear communication failures; if reader validation is unavailable, report a warning that it was skipped.

## Quality Floor

- Self-contained single file: inline CSS/JS, no network requests.
- Keyboard usable, visible focus, reduced motion respected, WCAG AA contrast.
- Content readable without JS; print/PDF output stays usable.
- All color/space/type values derive from a consistent token system — no scattered magic values.
- Technical titles that name the subject directly (`Workflow indicator lifecycle`, not `The Journey of State`).
- Scope and intended discussion clear early; why before how.
- System shape shown visually — flow, compare, cards, key/value specs, or annotated code — instead of prose walls; 3–5 bullets max per section.
- Boundaries, tradeoffs, and consequences surfaced; no implementation checklists or step-by-step coding instructions.
- Ends with memorable takeaways or decisions.

## Output Location

- If the user provides a path, write there.
- If tied to a tracked feature ID, prefer `agent-work/decks/<feature-id>-<slug>.html`.
- Otherwise use `agent-work/decks/<slug>.html`.

Create parent directories as needed. Do not put generated HTML in `docs/` unless the user explicitly wants it to be durable project documentation.

## Report

State the created file path and a one-sentence summary of what the explanation covers. Include design-delegation or reader-validation warnings, plus any assumptions or gaps that affected the explanation.
