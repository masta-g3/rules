---
name: frontend-design
description: Visual design for new or reshaped UI, HTML pages, explainers, and decks. Use when choosing palette, type, layout, or diagrams, or when critiquing a design that looks templated.
license: Adapted from anthropics/skills frontend-design (Apache-2.0); modified.
---

Make design choices that belong to this brief. The usual failure is not ugliness but a page that could serve any subject unchanged.

## Ground the design in the subject

- Identify the subject, the audience, and the design's main job. Ask only when missing information blocks a design choice; otherwise state your assumptions.
- Take distinctive choices from the subject's world: its materials, vernacular, and real artifacts. Prefer real content, such as an actual screen, row, or file, over invented stand-ins.
- Open with the most characteristic thing in that world, in the form that suits it: a headline, an image, a live example, or an interactive moment.
- Follow the user's preferences and existing design system. The brief's own words win, including when it asks for one of the looks below.

## Do not spend open choices on defaults

Generated designs cluster around these looks whatever the subject. Each suits some briefs. Where the brief leaves a choice open, do not use one:

1. Warm cream background (near `#F4F1EA`) with a high-contrast serif display and a terracotta accent (near `#D97757`).
2. Near-black background with one acid-green or vermilion accent.
3. Broadsheet layout: hairline rules, zero border radius, dense newspaper columns.
4. Card kit: content cut into identical rounded cards, one radius everywhere, the same soft grey shadow, decorative gradient washes.
5. Docs-site look: cool grey-blue page, system sans, bordered panels, colored section labels.
6. Template chrome:
   - a tracked-out all-caps eyebrow above each heading, or any label that adds nothing;
   - one italic, bold, or colored word in a headline;
   - `01 / 02 / 03` markers on content that is not a sequence;
   - monospace for small data labels;
   - tinted near-black (`#0B0B0B`, `#111`) standing in for black;
   - `A · B · C` meta strings, `WORD — fragment` labels, `→` appended to links and buttons;
   - a hero of one big number, a small label, supporting stats, and a gradient accent.
7. Motion: fade-and-slide-up on every section and hover transitions on every card.

## Process

1. **Plan.** Write a short design plan:
   - palette as 4–6 named hex values;
   - typefaces and their roles;
   - layout concept, with ASCII wireframes when comparing options, and alignment;
   - the one idea that makes this design specific to the brief.
2. **Review the plan.** Sketch what you would produce for a similar brief on another subject. Revise every part of your plan that matches it or the list above. Say what you changed and why.
3. **Build** from the revised plan.
4. **Critique the render.** View it at its intended size; take screenshots if you can. Fix anything that breaks the principles below or uses an unrequested default. Then remove one decoration that does not serve the brief.

## Principles

- **Spend boldness in one place.** Make one element memorable and keep the rest quiet. Never trade understanding for novelty.
- **Structure is information.** Borders, numbering, dividers, and labels must encode something about the content.
- **Encode meaning consistently.** Define a visual key once and reuse it: each color, line style, and glyph means one thing across the page. Never rely on color alone.
- **Keep diagrams traceable.** Lines do not cross; labels do not overlap or clip.
- **Choose type deliberately.** Use one or two clearly distinct families, not the ones you would use on any project. Set a clear scale; keep lines under 80 characters.
- **Use motion only with purpose.** Use one orchestrated moment at most. Motion that answers a user action and shows what changed is welcome.
- **Meet the quality floor without announcing it.** Provide visible keyboard focus, respect reduced motion, and meet WCAG AA contrast. Support the devices the brief targets.
- **Treat words as design.** Name things as users understand them. Actions say what happens and keep their name through the flow. Errors say how to fix the problem.
