# pv-fv-unification: Unified Portfolio & Feature Viewer

**Merge pv (portfolio viewer) and fv (feature viewer) into a single, extensible TUI**

> "Simplicity is the ultimate sophistication." — Leonardo da Vinci

---

## Overview

Unify `bin/pv` and `bin/fv` into a single tool that provides seamless navigation from portfolio-level overview down to individual feature details. The unified tool maintains the minimalist, single-file philosophy while establishing a foundation for future editing capabilities.

**Current State:**
```
pv (portfolio) ──subprocess──> fv (project)
     │                              │
     └── No back navigation ────────┘
```

**Target State:**
```
Portfolio ──Enter──> Project ──Enter──> Epic ──Enter──> Feature
    │                   │                 │                │
    └───────────────────┴─────────────────┴────────────────┘
                        Esc/b (back at any level)
```

---

## Design Principles

1. **Lazy Loading:** Portfolio scan is fast (aggregates only); full feature data loads on project entry
2. **Single File:** All code in one file (~900 lines), no external dependencies
3. **Extensible State:** State machine designed for future modes (edit, search, filter)
4. **Backward Compatibility:** `fv` becomes symlink/alias to unified tool with auto-detection
5. **Future-Ready:** Data model supports mutations (add/edit/remove features)

---

## Architecture

### Navigation Hierarchy

```
┌─────────────────────────────────────────────────────────────────────┐
│                        VIEW HIERARCHY                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐                                                   │
│  │  PORTFOLIO   │  Scan ~/Code, show project health                 │
│  │  (pv root)   │  Data: Portfolio { projects: [ProjectSummary] }   │
│  └──────┬───────┘                                                   │
│         │ Enter (lazy load full project)                            │
│         ▼                                                           │
│  ┌──────────────┐                                                   │
│  │   PROJECT    │  Dashboard: progress, epics, recent, next-up      │
│  │  (fv root)   │  Data: ProjectDetail { model: Model }             │
│  └──────┬───────┘                                                   │
│         │ Enter on epic                                             │
│         ▼                                                           │
│  ┌──────────────┐                                                   │
│  │    EPIC      │  Features list with status, dependencies          │
│  └──────┬───────┘                                                   │
│         │ Enter on feature                                          │
│         ▼                                                           │
│  ┌──────────────┐                                                   │
│  │   FEATURE    │  Full detail: description, metadata, steps        │
│  └──────────────┘                                                   │
│                                                                      │
│  Navigation: j/k (move), Enter (drill), b/Esc (back), q (quit)      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DATA MODEL                                   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Portfolio (scan result, in-memory)                                 │
│  ├── projects: list[ProjectSummary]                                 │
│  │   ├── path: str              # ~/Code/myapp                      │
│  │   ├── name: str              # myapp                             │
│  │   ├── total/done/active/pending: int                             │
│  │   ├── last_modified: datetime                                    │
│  │   ├── is_stalled: bool                                           │
│  │   └── _detail: ProjectDetail | None  # lazy loaded               │
│  │                                                                   │
│  ProjectDetail (loaded on demand)                                   │
│  ├── path: str                                                      │
│  ├── model: Model               # full fv data model                │
│  │   ├── features: dict[str, Feature]                               │
│  │   ├── epics: dict[str, Epic]                                     │
│  │   └── activity: dict[str, list[str]]                             │
│  └── dirty: bool                # for future: unsaved changes       │
│                                                                      │
│  Feature (unchanged from fv)                                        │
│  ├── id, status, title, description                                 │
│  ├── epic, depends_on, priority, created_at                         │
│  └── spec_file, steps, notes                                        │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### State Machine

```python
@dataclass
class State:
    # View stack for back navigation
    view: str  # 'portfolio' | 'project' | 'epic' | 'feature' | 'help'

    # Portfolio level
    portfolio: Portfolio | None
    project_index: int

    # Project level (lazy loaded)
    current_project: ProjectSummary | None
    epic_index: int

    # Epic level
    current_epic: str | None
    feature_index: int

    # Feature level
    current_feature: str | None

    # UI state
    sort_mode: str  # 'pending' | 'modified' | 'total' | 'completion'
    show_all: bool
    stalled_only: bool
    scroll_offset: int

    # Future: edit mode
    # mode: str  # 'navigate' | 'edit' | 'search'
```

### Entry Point Detection

```python
def detect_entry_point(args: list[str]) -> tuple[str, str]:
    """
    Determine starting view based on invocation:

    pv                  -> portfolio, scan ~/Code
    pv /path/to/dir     -> portfolio, scan /path/to/dir
    pv features.json    -> project, load features.json
    pv ./               -> project if features.json exists, else portfolio
    fv                  -> project, load ./features.json
    fv path/to/f.json   -> project, load path/to/f.json
    """
```

---

## File Structure

Single file with clear sections:

```python
#!/usr/bin/env python3
"""
pv - Portfolio & Feature Viewer

Unified TUI for features.json tracking.
Navigate: Portfolio → Project → Epic → Feature

Usage:
    pv                    # Scan ~/Code, portfolio view
    pv /path              # Scan specific directory
    pv features.json      # Project view for specific file
    fv                    # Alias: project view for ./features.json
"""

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 1: CONSTANTS
# ═══════════════════════════════════════════════════════════════════════════════

# Status sets, colors, box drawing, etc. (merge from both)

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 2: ANSI RENDERING
# ═══════════════════════════════════════════════════════════════════════════════

# ansi(), visible_len(), progress_bar(), truncate(), frame(), section_header()

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 3: DATA MODEL - FEATURES (from fv)
# ═══════════════════════════════════════════════════════════════════════════════

# Feature, Epic, Model dataclasses

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 4: DATA MODEL - PORTFOLIO (from pv)
# ═══════════════════════════════════════════════════════════════════════════════

# ProjectSummary, Portfolio, scan_projects()

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 5: VIEWS
# ═══════════════════════════════════════════════════════════════════════════════

# view_portfolio(), view_project(), view_epic(), view_feature(), view_help()

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 6: STATE & INPUT
# ═══════════════════════════════════════════════════════════════════════════════

# State, getch(), handle_input()

# ═══════════════════════════════════════════════════════════════════════════════
# SECTION 7: MAIN
# ═══════════════════════════════════════════════════════════════════════════════

# detect_entry_point(), render(), main()
```

---

## Implementation Phases

### Phase 1: Foundation — Merge Core Utilities

Combine shared code from both files into unified structure.

- [x] Create `bin/pv-unified` as working file
- [x] Merge constants (dedupe STATUS_*, COLOR_*, BOX)
- [x] Merge ANSI utilities (ansi, visible_len, progress_bar, truncate, frame, section_header)
- [x] Merge getch() (identical in both)
- [x] Add file header with unified docstring

**Verification:**
```bash
# File should parse without syntax errors
python3 -m py_compile bin/pv-unified

# Constants should be deduplicated
grep -c "STATUS_DONE" bin/pv-unified  # Should be 1
```

### Phase 2: Data Model — Unified Hierarchy

Combine Feature/Epic/Model from fv with ProjectSummary/Portfolio from pv.

- [x] Copy Feature, Epic, Model dataclasses from fv
- [x] Rename pv's `Project` to `ProjectSummary` to distinguish from detailed view
- [x] Refactor `ProjectSummary.from_path()` to store raw feature count without full parse
- [x] Add `_detail: Model | None` field to ProjectSummary for lazy loading
- [x] Add `load_detail()` method that parses full Model on demand
- [x] Note: Accept minor double-read overhead (scan reads for counts, detail reads for full data) — features.json files are small and this keeps scan fast
- [x] Keep Portfolio and scan_projects() from pv
- [x] Ensure Model.load() works standalone (for direct fv-style invocation)

```python
@dataclass
class ProjectSummary:
    path: str
    name: str
    total: int = 0
    done: int = 0
    active: int = 0
    pending: int = 0
    # ... other summary fields ...
    _detail: Model | None = field(default=None, repr=False)

    def load_detail(self) -> Model:
        """Lazy load full feature data."""
        if self._detail is None:
            features_path = os.path.join(self.path, 'features.json')
            self._detail = Model.load(features_path)
        return self._detail
```

**Verification:**
```bash
# Test data model loading
python3 -c "
import sys; sys.path.insert(0, 'bin')
exec(open('bin/pv-unified').read())
p = Portfolio.scan('~/Code')
print(f'Found {len(p.projects)} projects')
if p.projects:
    proj = p.projects[0]
    detail = proj.load_detail()
    print(f'{proj.name}: {detail.total} features, {len(detail.epics)} epics')
"
```

### Phase 3: State Machine — 4-Level Navigation

Extend state to handle full navigation stack.

- [x] Define State dataclass with view hierarchy
- [x] Add project_index, epic_index, feature_index for selection tracking
- [x] Add current_project, current_epic, current_feature for drill-down context
- [x] Implement view transitions in handle_input()
- [x] Ensure back navigation (b/Esc) works at each level

```python
@dataclass
class State:
    view: str = 'portfolio'  # portfolio | project | epic | feature | help

    # Portfolio level
    portfolio: Portfolio | None = None
    project_index: int = 0
    sort_mode: str = 'pending'
    show_all: bool = False
    stalled_only: bool = False

    # Project level
    current_project: ProjectSummary | None = None
    epic_index: int = 0

    # Epic level
    current_epic: str | None = None
    feature_index: int = 0

    # Feature level
    current_feature: str | None = None


def handle_input(key: str, state: State) -> State | None:
    """
    Navigation logic:

    Portfolio: j/k move, Enter→project, s sort, a/z filter, h help, q quit
    Project:   j/k move, Enter→epic, b/Esc/Backspace→portfolio, h help, q quit
    Epic:      j/k move, Enter/f→feature, b/Esc/Backspace→project, h help, q quit
    Feature:   b/Esc/Backspace→epic, h help, q quit
    Help:      b/Esc/any→back to previous view

    Back keys: 'b', '\x1b' (Esc), '\x7f' (Backspace)

    Note: Portfolio filter state (sort_mode, show_all, stalled_only) persists
    across drill-down and back navigation.
    """
```

**Verification:**
```bash
# Interactive test: navigate through all levels
./bin/pv-unified
# 1. See portfolio, press j/k to move
# 2. Press Enter on project → project dashboard
# 3. Press Enter on epic → epic detail
# 4. Press f on feature → feature detail
# 5. Press b repeatedly → back to portfolio
# 6. Press q → clean exit
```

### Phase 4: Views — Unified Rendering

Port all views with selection indicators at each level.

- [x] Port view_portfolio() from pv (selection cursor already exists)
- [x] Port view_project() from fv's view_dashboard() (epic selection cursor already exists)
- [x] Port view_epic() from fv (feature selection cursor already exists)
- [x] Port view_feature() from fv (read-only detail, no cursor needed)
- [x] Port view_help() — combine help from both tools
- [x] Update render() to dispatch based on state.view

**Key change:** Add selection cursors to views that didn't have them:

```python
def view_project(model: Model, state: State, width: int, height: int) -> list[str]:
    # ... existing dashboard code ...

    # Epic list with selection
    for i, (epic_name, epic) in enumerate(model.epics.items()):
        cursor = ansi('▸', COLOR_EPIC, bold=True) if i == state.epic_index else ' '
        # ... rest of epic rendering ...
```

**Verification:**
```bash
# Visual inspection at each level
./bin/pv-unified
# Verify: selection cursor visible and moves with j/k at each level
# Verify: all sections render (PROGRESS, EPICS, RECENT, NEXT UP, ATTENTION)
```

### Phase 5: Entry Point Detection

Smart startup based on invocation and arguments.

- [x] Implement detect_entry_point() function
- [x] Handle: no args, directory path, features.json path
- [x] Detect if invoked as `fv` (via argv[0] or symlink)
- [x] Initialize state appropriately for each entry mode

```python
def init_portfolio_state(root: str) -> State:
    """Initialize state for portfolio view by scanning directory."""
    portfolio = scan_projects(root)
    return State(view='portfolio', portfolio=portfolio)


def init_project_state(features_path: str) -> State:
    """Initialize state for direct project view."""
    model = Model.load(features_path)
    # Create a synthetic ProjectSummary for single-project mode
    proj = ProjectSummary.from_path(features_path)
    proj._detail = model  # Pre-loaded, no lazy load needed
    return State(
        view='project',
        portfolio=None,  # No portfolio in direct mode
        current_project=proj,
    )


def detect_entry_point() -> State:
    """
    Determine starting view and return initialized state.

    Invocation patterns:
    - pv              → portfolio, scan ~/Code
    - pv /some/path   → portfolio, scan /some/path (always portfolio for dirs)
    - pv features.json → project, load that file
    - fv              → project, ./features.json (error if missing)
    - fv path.json    → project, load path.json
    """
    prog_name = os.path.basename(sys.argv[0])
    is_fv_mode = prog_name in ('fv', 'fv.py')

    if len(sys.argv) < 2:
        if is_fv_mode:
            # fv with no args: expect ./features.json
            if os.path.exists('features.json'):
                return init_project_state('features.json')
            else:
                print("Error: features.json not found")
                print("Run from a directory containing features.json, or specify path.")
                sys.exit(1)
        else:
            # pv with no args: scan ~/Code
            return init_portfolio_state('~/Code')

    arg = sys.argv[1]

    if arg in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)

    if arg.endswith('.json'):
        # Explicit JSON file → project view
        if not os.path.exists(arg):
            print(f"Error: {arg} not found")
            sys.exit(1)
        return init_project_state(arg)

    if os.path.isdir(arg):
        # Directory → always portfolio scan (pv semantics)
        # Use fv explicitly for project view
        return init_portfolio_state(arg)

    print(f"Error: {arg} not found")
    sys.exit(1)
```

**Verification:**
```bash
# Test each entry pattern
./bin/pv-unified                           # Portfolio of ~/Code
./bin/pv-unified /tmp                      # Portfolio of /tmp
./bin/pv-unified ./features.json           # Project view (if file exists)
ln -sf pv-unified bin/fv-new && ./bin/fv-new  # fv mode

# Error cases
./bin/pv-unified /nonexistent              # Should error cleanly
```

### Phase 6: Polish & Compatibility

Final integration, symlinks, and edge cases.

- [x] Handle edge cases: empty portfolio, empty project, malformed JSON
- [x] Add help overlay (h/?) accessible from any view
- [x] Non-interactive mode: render and exit (for piping)
- [x] Rename `bin/pv-unified` → `bin/pv`
- [x] Create `bin/fv` as symlink to `bin/pv`
- [x] Archive old files to `docs/history/` (as pv-pre-unification.py, fv-pre-unification.py)
- [x] Update documentation if needed

```bash
# Symlink setup
cd bin
mv pv pv-old  # backup
mv pv-unified pv
ln -sf pv fv
rm fv-old pv-old  # cleanup after verification
```

**Verification:**
```bash
# Symlink works
ls -la bin/fv  # Should show -> pv

# Both entry points work
./bin/pv       # Portfolio
./bin/fv       # Project (or error if no features.json)

# Edge cases
echo '[]' > /tmp/empty.json && ./bin/pv /tmp/empty.json
echo 'invalid' > /tmp/bad.json && ./bin/pv /tmp/bad.json

# Non-interactive
./bin/pv | head -20  # Should render once and exit
```

---

## Future Extensions (Out of Scope)

These are **not** part of this plan but the architecture supports them:

1. **Edit Mode:** Add/remove/modify features in-place
   - State gains `mode: 'navigate' | 'edit'`
   - Feature view becomes editable form
   - `dirty` flag tracks unsaved changes
   - Save writes back to features.json

2. **Search/Filter:** Fuzzy find across features
   - `/` enters search mode
   - Filter visible items by query

3. **Multi-Select:** Bulk status changes
   - Space to toggle selection
   - Bulk operations on selected

4. **Watch Mode:** Auto-refresh on file change
   - inotify/fsevents integration

---

## Rollback Plan

If issues arise:
1. Old `bin/pv` and `bin/fv` archived in `docs/history/`
2. Restore with: `cp docs/history/pv-original bin/pv`
3. Symlink cleanup: `rm bin/fv && cp docs/history/fv-original bin/fv`

---

## Summary

| Metric | Before | After |
|--------|--------|-------|
| Files | 2 (pv, fv) | 1 (pv + fv symlink) |
| Lines | ~1300 combined | ~1100 (unified with 4-level nav) |
| Navigation | Subprocess boundary | Seamless back/forward |
| Entry points | Separate tools | Unified with detection |
| Extensibility | Limited | State machine ready for edit mode |
