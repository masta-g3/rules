# Explanation Patterns

Use these patterns to turn source material into a concise technical HTML briefing.

## Presentation Principles

- **Technical titles only.** Name the subject directly. Avoid metaphorical, poetic, or marketing-style titles.
- **One strong slide first.** Default to a single focused technical discussion artifact. Add slides only when progressive detail genuinely helps.
- **Lead with the point.** A reader should understand the main claim from the heading and lead sentence.
- **Show structure visually.** Prefer flows, before/after comparisons, component maps, key/value specs, and annotated code over paragraphs.
- **Use progressive depth only when needed.** Start with purpose and mental model; add anatomy, flow, tradeoffs, and takeaways only when they support discussion.
- **Keep density controlled.** Use 3-5 bullets max per section. Prefer one elegant SVG diagram, visualization, or annotated snippet over multiple text-heavy slides.
- **Explain consequences.** Include boundaries, tradeoffs, risks, or operational implications when they help future decisions.
- **No planning residue.** Do not include implementation phases, checklists, estimates, or task assignments unless explicitly requested.

## Recommended Shape

Default to one slide/section that combines:

1. **Title / scope** — What this explains and what decision or discussion it supports.
2. **Core point** — The main idea in one or two sentences.
3. **Visual explanation** — An elegant SVG diagram, flow, comparison, component map, visualization, or short annotated code snippet.
4. **Discussion anchors** — Tradeoffs, open questions, implications, or takeaways.

Add more slides only when one canvas would become crowded. A broad architecture overview might need separate purpose, anatomy, flow, and tradeoff slides; a narrow proposal usually should not.

## Pattern Selection

| Subject | Strong opening | Useful supporting slides |
| --- | --- | --- |
| Concept | Purpose + mental model | Anatomy, examples, takeaways |
| Feature | Purpose + user/system effect | Flow, key specs, tradeoffs |
| Change / PR | Before/after | Flow, code annotation, consequences |
| Refactor | Before/after | Invariants, code annotation, boundaries |
| Architecture | Component map | Flow, responsibilities, tradeoffs |
| Technical decision | Decision statement | Alternatives, tradeoffs, implications |

## Content Rules

- Prefer concrete names from the codebase over generic labels.
- Keep code snippets short: 10-30 lines, with one annotation explaining why the snippet matters.
- Use diagrams or structured cards when prose would require multiple paragraphs.
- In SVG diagrams, do not rely on one-line `<text>` inside fixed-width boxes for labels. Use the template's `.svg-label` with `<foreignObject>` or explicit multi-line `<tspan>` labels, and test long labels at narrow widths.
- Do not pretend future work is implemented; phrase status precisely.
- Do not invent performance, security, or UX claims without evidence.
- Use reader validation to catch communication failure: the reader's takeaway matters more than whether the source HTML is clever.
