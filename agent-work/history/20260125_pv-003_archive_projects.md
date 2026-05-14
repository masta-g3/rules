**Feature:** pv-003 → Archive Projects via UI

## Overview

Add the ability to archive completed projects from the portfolio view. Archived projects are hidden by default but can be shown via filter toggle. Uses a `.archived` marker file in the project directory—no schema changes to `features.json`.

## Design

### Approach

Use a simple `.archived` marker file in each project directory:
- Present = project is archived
- Absent = project is active

This avoids any changes to the `features.json` schema and keeps detection simple during directory scanning.

### Data Flow

```
scan_projects()
    │
    ├── detect features.json
    ├── detect .archived marker
    │
    └── ProjectSummary(archived=True/False)
            │
            └── Portfolio.filtered(mode)
                    │
                    ├── 'open'     → exclude archived
                    ├── 'all'      → include archived
                    ├── 'active'   → exclude archived
                    ├── 'stalled'  → exclude archived
                    └── 'archived' → only archived
```

### Filter Modes

`['open', 'all', 'active', 'stalled', 'archived']`

The `f` key cycles through all modes. When viewing archived projects, they appear with a dimmed `⊘` indicator.

### Keybinding

- `A` (shift+a) in portfolio/tree view: toggle archive state of selected project
  - If not archived → create `.archived` file
  - If archived → remove `.archived` file

## Implementation Summary

- [x] Add `archived` field to ProjectSummary dataclass
- [x] Detect `.archived` marker in `from_path()`
- [x] Add `archived_projects` property to Portfolio
- [x] Update `Portfolio.filtered()` for archived handling
- [x] Add 'archived' to FILTER_MODES
- [x] Add `toggle_archive()` function
- [x] Handle 'A' key in portfolio input handler
- [x] Handle 'A' key for project nodes in tree view
- [x] Show archived count in portfolio summary
- [x] Display '⊘' suffix on archived projects
- [x] Add [A]rchive hint to footer
- [x] Document in help view
- [x] Filter archived projects in tree view (unless show_all)

## Changes

| Location | Change |
|----------|--------|
| Constants | Add 'archived' to FILTER_MODES |
| ProjectSummary | Add `archived: bool` field |
| ProjectSummary.from_path() | Detect `.archived` marker |
| Portfolio | Add `archived_projects` property |
| Portfolio.filtered() | Handle 'archived' mode, exclude from others |
| toggle_archive() | New function to create/remove marker |
| handle_portfolio_input() | Handle 'A' key |
| handle_tree_input() | Handle 'A' key for project nodes |
| view_portfolio() | Show archived count and status indicator |
| build_tree() | Filter archived projects |
| render() | Update footer hint |
| view_help() | Document new keybinding |

## Edge Cases

1. **Archive last visible project**: Cursor clamps to previous item or shows empty state
2. **Archive in 'all' filter**: Project stays visible but shows archived indicator
3. **Tree view archive**: Tree rebuilds, cursor position preserved where possible
4. **Permission error on marker file**: Let it surface naturally (no silent catch)
