# pv-005: Unified Filter Cycling

**Feature:** Replace a/z toggle filters with single `f` key that cycles through filter modes.

## Problem

Portfolio view had two filter hotkeys (`a` for show_all, `z` for stalled_only) that were mutually exclusive but implemented as separate toggles. Adding more filters would require more hotkeys, increasing cognitive load.

## Solution

Single `f` key cycles through filter modes, mirroring the existing `s` sort cycle pattern:

```
Filter modes:  open → all → active → stalled → (back to open)
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  State                                                  │
│  ├── filter_mode: str  (replaces show_all, stalled_only)│
│  └── FILTER_MODES = ['open', 'all', 'active', 'stalled']│
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Portfolio.filtered(mode: str) -> list[ProjectSummary] │
│  ├── 'open'   : has_open_work (pending + active > 0)   │
│  ├── 'all'    : all projects                           │
│  ├── 'active' : active > 0                             │
│  └── 'stalled': is_stalled                             │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│  Footer display                                         │
│  └── [s]ort:open [f]ilter:open [t]ree [?]help [q]uit   │
└─────────────────────────────────────────────────────────┘
```

## Summary

- [x] Added FILTER_MODES constant after SORT_MODES
- [x] Replaced show_all/stalled_only booleans with filter_mode string in State
- [x] Updated Portfolio.filtered() to accept mode string
- [x] Replaced `a`/`z` handlers with `f` cycle handler
- [x] Updated footer to show sort:mode filter:mode format
- [x] Tree view derives show_all from filter_mode; `a` key syncs back
- [x] Updated docstring and help view documentation
