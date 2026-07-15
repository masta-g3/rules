---
name: explain-html
description: Create a self-contained HTML explainer for project knowledge or proposed work: codebase structure, concepts, features, flows, plans, changes, and technical decisions. Use for visual explanations and briefings, not implementation task lists.
metadata:
  thinkingLevel: high
---

Create a polished, grounded visual explanation—not an implementation plan or a slide rendering of source material. The deliverable is one self-contained `.html` file for a defined audience. Explain existing reality, proposed change, or project knowledge; omit planning machinery unless requested.

## Workflow

1. **Ground the explanation.** Inspect the relevant project sources: `CONTEXT.md`, code, docs, plans, tickets, conversation context, or user notes. Separate existing facts, proposals, and open questions. Ask only about blocking ambiguity; otherwise choose the smallest useful scope.
2. **Get design direction.** Before building or materially changing layout/theme, invoke the `frontend-designer` subagent with the subject, audience, and content outline; ask for format, information hierarchy, and visual direction. If it is unavailable, continue with the bundled references and report a warning that design delegation was skipped.
3. **Choose the format by content**, guided by the design pass:
   - **Slide deck** — progressive walkthroughs or meeting discussion.
   - **Long-form article** — reference, onboarding, or deep explanation.
   - **Single canvas** — one focused concept, system, or proposal.

   Start with one strong view; add more only when progressive detail genuinely helps.
4. **Build the file.** `assets/explain-deck-template.html` is a known-good scaffold for the deck format — reuse or adapt its mechanics (theme tokens, keyboard nav, print CSS) freely, but take the visual direction from the design pass, not from the preset swaps. `references/component-library.md` offers proven content shapes for any layout; `references/explanation-patterns.md` covers narrative structure. Inline all CSS/JS, escape code snippets, keep the file offline-safe.
5. **Validate the artifact and its explanation.** Confirm valid HTML and the quality floor below. Ask a fresh subagent to view the rendered result as an audience member: what did it understand, is it correct, and what felt confusing? Fix communication failures; report if reader validation was unavailable.

## Quality Floor

- Self-contained and offline-safe: inline CSS/JS, no network requests.
- Keyboard usable, visible focus, reduced motion, WCAG AA contrast; readable without JS and in print/PDF.
- All color/space/type values derive from a consistent token system — no scattered magic values.
- Direct titles that name the subject (`Workflow indicator lifecycle`, not `The Journey of State`).
- Scope and intended understanding clear early; why before how.
- Match the audience's technical level; follow the terminology guidance in `references/explanation-patterns.md`.
- Make each visual understandable on its own with a takeaway title, clear labels, and a short caption or legend when needed. Do not rely on unexplained symbols, abbreviations, or color alone.
- Explain the subject visually—flows, comparisons, maps, cards, specs, or annotated code—instead of prose walls; 3–5 bullets max per section.
- Surface relevant boundaries, status, tradeoffs, and consequences; omit implementation checklists unless requested.
- Ends with memorable takeaways or decisions.

## Output Location

- If the user provides a path, write there.
- If tied to a tracked feature ID, prefer `agent-work/decks/<feature-id>-<slug>.html`.
- Otherwise use `agent-work/decks/<slug>.html`.

Create parent directories as needed. Do not put generated HTML in `docs/` unless the user explicitly wants it to be durable project documentation.

## Report

State the created file path and a one-sentence summary of what the explanation covers. Include design-delegation or reader-validation warnings, plus any assumptions or gaps that affected the explanation.
