---
name: explain-html
description: "Create a self-contained HTML visual explainer for concepts, codebases, features, flows, plans, changes, and decisions. Choose the design to suit the subject and audience."
---

Create one self-contained `.html` file that helps a reader understand the requested subject. Explain it visually, rather than turning source material into slides. Omit implementation checklists and planning machinery unless requested.

Explain the smallest set of ideas the reader needs. Remove secondary detail before adding sections. Prefer one clear mental model over a complete account. Add depth only when requested or needed to prevent misunderstanding.

## Ground the explanation

- Identify the audience and what they should understand afterward. Ask only about blocking ambiguity; otherwise use the request and context to choose the smallest useful scope.
- Inspect relevant sources: conversation, user notes, `CONTEXT.md`, code, docs, plans, or tickets. Distinguish existing facts, proposals, and open questions. Do not invent claims or imply that planned work is implemented.
- Lead with the main point and why it matters. Include boundaries, tradeoffs, and consequences where they affect understanding.

## Choose the design

Before coding, form a brief design direction: the central visual idea, format, typography, and palette. This is a working note, not a separate deliverable or approval step. Follow the user's stated preferences.

Let the subject determine the visual form. A lifecycle may need a state diagram; a concept may need a worked example; a change may need an annotated comparison. Use a single view, article, deck, or another format as appropriate. Add sections only when they help the reader.

- Make deliberate choices about typography, color, spacing, and composition. Use type size and weight to show hierarchy; keep text comfortably readable.
- Do not default to a card grid, preset palette, or repeated slide layout. Avoid decorative labels, unnecessary uppercase headings, and numbering that does not represent a sequence.
- Let visuals carry the explanation. Show relationships, sequences, and differences through diagrams, comparisons, or worked examples. Use short text to orient the reader and explain what to notice. Do not turn paragraphs into boxes and call that visual explanation.
- Give the main explanatory visual more space and emphasis than supporting content. Add motion or interaction only when it helps explain the subject.

Before building, ask whether the design fits this subject or could be reused unchanged for almost anything. Revise generic choices, but do not add novelty at the expense of understanding. Use a design subagent when it would help resolve a difficult design choice, not as a required step.

## Build and write

- Inline CSS, JavaScript, and assets. Keep the file offline-safe with no network requests. Use JavaScript only where needed; keep the core explanation readable without it.
- Target desktop reading by default. Add mobile layouts or print/PDF support when the requested use calls for them.
- For multi-section explainers, let Left/Right arrow keys move between sections. Keep normal scrolling and do not intercept keys when a control has focus.
- For longer explainers, add a compact linked table of contents.
- Keep styling consistent. Follow the system's light/dark preference by default; do not add a theme toggle unless requested.
- Keep controls keyboard usable, show focus, respect reduced motion, and use WCAG AA text contrast. Do not convey meaning through color alone.
- Use direct titles, short declarative sentences, active voice, and plain words in the spirit of ASD-STE100 Simplified Technical English. Match the audience's technical level. Define unfamiliar terms and use names consistently.
- Make each visual understandable on its own, with clear labels and a takeaway title. Add a caption or legend when needed. Keep code examples short, escape HTML characters, and explain what the reader should notice.
- End with the main takeaway or decision, without repeating the whole explanation.

After the complete HTML exists, apply the `unslop` skill to its visible prose. Preserve technical meaning, identifiers, and code samples.

## Inspect and refine

View the rendered file at its intended reading size. Check text size, hierarchy, spacing, diagram labels, clipping, and overlap. Test any controls and confirm the file works offline.

Check the explanation against its sources. Can the reader identify the main point and follow the visuals without guessing? For complex explanations, use a fresh reader subagent to identify confusing or misleading parts.

Make a removal pass. Cut repeated points, unnecessary labels, decoration, and details that do not change the reader's understanding. If a view feels dense, simplify the content before shrinking text or splitting it into more views.

Fix the issues found. If rendered inspection was unavailable, say so; do not claim visual validation.

## Save and report

- Use the user's path when provided.
- For a tracked feature, prefer `agent-work/decks/<feature-id>-<slug>.html`.
- Otherwise use `agent-work/decks/<slug>.html`.

Create parent directories as needed. Use `docs/` only when the user wants durable project documentation.

Return the file path and a one-sentence summary. Note any material assumptions, source gaps, or validation limits.
