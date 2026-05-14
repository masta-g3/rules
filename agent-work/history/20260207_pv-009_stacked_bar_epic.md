**Feature:** pv-009 → Stacked bar chart by epic in activity view

# Summary

Added epic-level breakdown to the activity bar chart via stacked bars. Press `e` in bar chart mode to toggle. Uses Tufte-inspired "Top 4 + Other" grouping to avoid visual clutter regardless of epic count.

## What was built

- `ActivityData.epic_completions`: per-epic completion tracking, populated in existing `from_portfolio()` loop
- `rank_epics()`: ranks epics by completion count, collapses >4 into gray "other" bucket
- `render_bar_chart()`: extended with optional stacked rendering (per-cell segment coloring)
- `render_epic_legend()`: ANSI-safe compact legend with width-aware truncation
- `e` key toggle in bar chart mode, context-aware footer and tab label updates

## Design decisions

- **Top 4 + Other**: based on categorical color perception research (Healey 1996, Ware 2004) — beyond ~7 categories, humans can't reliably map colors to labels
- **5-color desaturated palette**: steel blue (75), sage green (114), warm sand (180), muted purple (139), gray (243)
- **Sub-mode of bar chart**: not a third top-level chart; `e` only active when `activity_chart_mode == 'bar'`
- **No extra interaction modes**: no scrollable legends or filter toggles — chart stands alone per Tufte's principles

## Also fixed

- `epic-init.md` was missing `epic:` field in its YAML template — root cause of missing epic data across portfolio
- Backfilled `epic:` field on ~141 features across 7 projects (derived from ID prefix)
- Removed dead `h` key from `handle_activity_input()` (intercepted by help handler)
- Cleaned up `other_epics` ternary for readability

## Phases completed

- [x] Phase 1: Data layer (ActivityData, rank_epics, State, constants)
- [x] Phase 2: Stacked bar chart rendering + legend
- [x] Phase 3: Input & UI integration (keybindings, footer, help)
- [x] Phase 4: Edge cases & polish
