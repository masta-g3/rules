# skill-017 — Loosen explain-html skill rigidity

**Status:** done (2026-07-07)

## Goal

Remove the explain-html skill's single mandated deliverable shape (copy the deck template, pick one theme preset, assemble slides) so format and visual direction follow the content and the `frontend-designer` design pass, while shortening `SKILL.md` and reframing the references as adaptable patterns.

## Delivered

- **`skills/explain-html/SKILL.md`** (68 → 55 lines): folded the standalone "Required Design Delegation" and "Deck Format" sections into a numbered Workflow; format is now a content-driven choice (slide deck / long-form article / single canvas) instead of deck-by-default with an "explicit rejection" gate; merged the old Quality Bar + deck invariants into one format-independent Quality Floor; template demoted to an optional scaffold whose mechanics may be reused/adapted, with visual direction from the design pass rather than preset swaps.
- **`references/component-library.md`**: intro reframed from "copy these slide sections into the template" to layout-agnostic content shapes, noting the example `slide`/`panel` classes map to whatever container the chosen format uses.
- **`references/explanation-patterns.md`**: slide-only wording generalized to views/sections; pattern-selection table and content rules unchanged.
- **`assets/explain-deck-template.html`**: header comment repositioned as an optional deck scaffold, plus six discovered-work mechanics fixes (user-approved): IntersectionObserver center-band detection (`rootMargin: -45% 0`) so tall slides keep the counter in sync; `scroll-snap-type` mandatory → proximity (no scroll trap); global `:focus-visible` accent outline; progress/counter hidden for single-slide files; no forced print page-break after the last slide; `text-wrap: balance` on headings.

## Verification

Generated multi-slide (incl. a 250vh slide) and single-slide instances from the template and drove them with Playwright: 9/9 checks passed (counter sync, keyboard nav, no snap trap, focus outline, chrome shown/hidden by slide count). Prose changes reviewed by a general-purpose critic pass → LGTM.

## Session notes

- The repo's `code-critic`/`plan-critic`/`docs-critic` subagents (`model: openai-codex/gpt-5.5`, Pi-style lowercase tool names) execute no tools when spawned from a Claude Code session and can fabricate reviews; worked around with a general-purpose agent carrying the criteria inline. Captured in `docs/STRUCTURE.md`, `AGENTS.md`, and cross-session memory.
- Not in scope, noted for a possible future ticket: keyboard-only users cannot scroll within a slide taller than the viewport (all paging keys jump slides).
