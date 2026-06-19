---
name: explain-html
description: Create a self-contained, presentation-like HTML explanation for a concept, feature, change, refactor, architecture, or technical decision, whether it is already implemented or being proposed. Use when the user asks for an explainer, overview, walkthrough, conceptual/technical briefing, visual explanation, or HTML discussion artifact rather than a task checklist.
metadata:
  thinkingLevel: high
---

Create a polished HTML explanation, not an implementation plan.

The deliverable is a self-contained `.html` file that reads like a concise technical briefing and presents as a focused technical discussion aid. Keep the work grounded in source material and strip planning machinery: no phase checklists, no TDD steps, no execution instructions, no ticket lifecycle work unless the user explicitly asks.

## Required Design Delegation

Before building or materially changing the layout/theme, invoke the `frontend-designer` subagent for UI/UX guidance. Ask it to review the explanation's audience, information hierarchy, slide structure, theme choice, and any custom components. Use clear, technical titles — not metaphorical names.

If `frontend-designer` is unavailable, continue using the bundled design guidance and report a clear warning that design delegation was skipped.

## Workflow

1. **Ground the explanation.** Inspect the relevant source of truth: code, docs, plans, tickets, conversation context, or user-provided notes. Separate known facts from open questions without turning the output into an implementation plan.
2. **Clarify only blocking ambiguity.** If audience, scope, or output location is unclear and cannot be inferred, ask the user. Otherwise choose the smallest useful scope.
3. **Read resources as needed.** Use:
   - `references/explanation-patterns.md` for narrative structure and presentation principles.
   - `references/component-library.md` for slide/component patterns.
   - `assets/explain-deck-template.html` as the copyable HTML scaffold.
4. **Design the artifact.** Start with one focused slide/section. Add more only when the subject needs progressive detail or discussion support. Use a clear technical title, concise prose, visual structure, and only diagrams, visualizations, or code snippets that directly explain the concept.
5. **Create the HTML.** Copy the template, choose one theme preset, assemble sections from the component library, inline all CSS/JS, escape code snippets, and keep the file offline-safe.
6. **Validate quickly.** Check that the file opens as valid HTML, keyboard navigation works by inspection or browser test when available, content is readable without JS, and print/PDF output remains usable.
7. **Run reader validation.** Ask a fresh subagent to view the rendered deck as an audience member, not to inspect the HTML/CSS/JS source. Ask what it understood, whether that understanding is correct, and what felt confusing or unclear. Fix clear communication issues; if reader validation is unavailable, report a warning that it was skipped.

## Default Output Location

- If the user provides a path, write there.
- If tied to a tracked feature ID, prefer `agent-work/decks/<feature-id>-<slug>.html`.
- Otherwise use `agent-work/decks/<slug>.html`.

Create parent directories as needed. Do not put generated HTML in `docs/` unless the user explicitly wants it to be durable project documentation.

## Explanation Quality Bar

A strong `explain-html` output:

- names the subject directly (`Workflow indicator lifecycle`, not `The Journey of State`)
- makes the scope and intended discussion clear early
- explains why the concept exists before how it works
- shows the system shape visually: flow, compare, cards, key/value specs, or annotated code
- surfaces boundaries, tradeoffs, and consequences without over-planning
- avoids implementation checklists and step-by-step coding instructions
- ends with memorable takeaways or decisions

Keep the experience elegant and fast to understand. Prefer refined minimalism: strong spacing, careful type scale, a single accent color, restrained motion, and consistent CSS tokens.

## Deck Format

Use the slide-like HTML format by default, but prioritize one excellent slide over many average ones:

- Full-viewport section(s) with scroll-snap when there is more than one.
- Arrow/Page/Home/End keyboard navigation.
- Scroll fallback for readers who prefer a document.
- Print CSS that exports each slide cleanly.
- Semantic sections, real headings, skip link, reduced-motion support, and accessible contrast.

Only create a plain long-form HTML article if the user explicitly rejects slide/deck behavior.

## Output

Report the created file path and a one-sentence summary of what the explanation covers. Include design-delegation or reader-validation warnings, plus any assumptions or gaps that affected the explanation.
