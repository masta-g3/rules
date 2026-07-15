# Explanation Patterns

Use these patterns to turn project knowledge or proposed work into a clear visual explanation.

## Presentation Principles

- **Direct titles.** Name the subject clearly. Avoid metaphorical, poetic, or marketing-style titles.
- **One strong view first.** Default to a single focused technical discussion artifact. Add views only when progressive detail genuinely helps.
- **Lead with the point.** A reader should understand the main claim from the heading and lead sentence.
- **Show structure visually.** Prefer flows, before/after comparisons, component maps, key/value specs, and annotated code over paragraphs.
- **Use progressive depth only when needed.** Start with purpose and mental model; add anatomy, flow, tradeoffs, and takeaways only when they support discussion.
- **Keep density controlled.** Use 3-5 bullets max per section. Prefer one elegant SVG diagram, visualization, or annotated snippet over multiple text-heavy sections.
- **Explain consequences.** Include boundaries, tradeoffs, risks, or operational implications when they help future decisions.

## Recommended Shape

Whatever the format — deck, article, or single canvas — default to one view that combines:

1. **Title / scope** — What this explains and what understanding, question, or decision it supports.
2. **Core point** — The main idea in one or two sentences.
3. **Visual explanation** — An elegant SVG diagram, flow, comparison, component map, visualization, or short annotated code snippet.
4. **Discussion anchors** — Tradeoffs, open questions, implications, or takeaways.

Add more views only when one would become crowded. A broad architecture overview might need separate purpose, anatomy, flow, and tradeoff sections; a narrow proposal usually should not.

## Pattern Selection

| Subject | Strong opening | Useful supporting sections |
| --- | --- | --- |
| Codebase or subsystem | System map | Responsibilities, flow, boundaries |
| Project concept | Purpose + mental model | Meaning, examples, relationships |
| Feature or workflow | User/system effect | Flow, states, key behavior |
| Plan or proposal | Intended outcome | Rationale, system effect, alternatives, open questions |
| Change or decision | Before/after or decision | Invariants, tradeoffs, consequences |

## Content Rules

- Prefer plain language matched to the audience. When technical terms are needed, use terminology established in `CONTEXT.md` (when present) or the source material rather than inventing labels, and briefly define unfamiliar terms.
- Keep code snippets short: 10-30 lines, with one annotation explaining why the snippet matters.
- Use diagrams or structured cards when prose would require multiple paragraphs.
- In SVG diagrams, do not rely on one-line `<text>` inside fixed-width boxes for labels. Use the template's `.svg-label` with `<foreignObject>` or explicit multi-line `<tspan>` labels, and test long labels at narrow widths.
- Do not pretend future work is implemented; phrase status precisely.
- Do not invent performance, security, or UX claims without evidence.
- Use reader validation to catch communication failure: the reader's takeaway matters more than whether the source HTML is clever.
