# pv-001: Project Viewer TUI

**A portfolio-level dashboard for all projects with features.json**

> "The purpose of visualization is insight, not pictures." — Ben Shneiderman

---

## Overview

A single-file Python script (`pv`) that scans `~/Code` for all projects containing `features.json` and renders a portfolio-level dashboard. Where `fv` shows epic/feature details for one project, `pv` shows project health across your entire codebase.

**Design Philosophy:**
- **Tufte-inspired**: High data density, no chartjunk
- **Portfolio focus**: Project-level metrics, not epic/feature drill-down
- **Ephemeral data**: Scan on invocation, no persistent cache
- **Composable**: Select a project to launch `fv` for deeper inspection

**Key Difference from fv:**
- `fv`: One project, many epics/features (depth)
- `pv`: Many projects, summary metrics (breadth)

---

## Data Model

### Scan Strategy

Ephemeral scan on each invocation. No cache file needed because:
1. Scanning `~/Code` for `features.json` is fast (< 1s for ~100 repos)
2. Data freshness is guaranteed
3. No sync/stale cache issues
4. Simpler implementation

```python
@dataclass
class Project:
    path: str              # ~/Code/micro_apps/harvest-bloom
    name: str              # harvest-bloom (derived from path)
    total: int             # total features
    done: int              # completed features
    active: int            # in_progress features
    pending: int           # pending features
    abandoned: int         # abandoned/superseded
    epics: int             # unique epic count
    open_epics: int        # epics with pending/active work
    last_modified: datetime # features.json mtime
    oldest_pending: str    # oldest pending feature created_at
    worked_today: bool     # features.json modified today
```

### Filtering

Default: Show only projects with `open_epics > 0` (has pending/active work)

Filters (toggle with keys):
- `a` - Show all projects (including 100% done)
- `z` - Show only stalled projects (no activity in 30+ days)

### Sorting

Cycle through with `s`:
1. **Pending count** (desc) - Most work remaining
2. **Last modified** (desc) - Recently touched
3. **Total features** (desc) - Largest projects
4. **Completion %** (asc) - Least complete first

---

## Visual Design

### Color Palette (ANSI 256)

```
┌─────────────────────────────────────────────────────────┐
│  Background     │  Terminal default (transparent)       │
│  Primary Text   │  Default foreground                   │
│  Muted Text     │  ANSI 240 (gray)                      │
│  Healthy        │  ANSI 34 (green) - >80% complete      │
│  Active         │  ANSI 33 (yellow) - has in_progress   │
│  Stalled        │  ANSI 131 (rust) - no recent activity │
│  Project Name   │  ANSI 39 (cyan)                       │
│  Border         │  ANSI 237 (subtle gray)               │
└─────────────────────────────────────────────────────────┘
```

### Typography

- Monospace terminal native
- Unicode box-drawing for structure
- Progress bars: `████████░░░░` (block characters)
- Sparklines for velocity: `▁▂▃▄▅▆▇█`
- Status indicators: `●` active, `○` stalled, `✓` complete
- Today indicator: `◆` worked today (features.json modified today)

### Layout

```
┌─ pv ─────────────────────────────────────────────────────── ~/Code ─┐
│                                                                     │
│  PORTFOLIO ════════════════════════════════════════════════════════ │
│                                                                     │
│  12 projects   847 features   ███████████████░░░░░  672 done (79%)  │
│  ● 4 active    ○ 3 stalled    ✓ 5 complete                          │
│                                                                     │
│  PROJECTS ═════════════════════════════════════════════════════════ │
│                                                                     │
│  ▸harvest-bloom  ████████████████░░  57/63   90%  ● 2 active  ◆ Jan 22│
│   llmpedia_social████████████░░░░░░  34/48   71%  ● 1 active    Jan 20│
│   dexter         █████████████████░  41/45   91%  ○ stalled     Jan 09│
│   micro_apps/dai █████░░░░░░░░░░░░░   8/24   33%  ● 3 active    Jan 13│
│   webdev/homepage████████████████░░  12/14   86%  ○ stalled     Jan 14│
│                                                                     │
│  ATTENTION ════════════════════════════════════════════════════════ │
│                                                                     │
│  ⚠ dexter: stalled 14 days, 4 pending features                      │
│  ⚠ webdev/homepage: stalled 9 days, 2 pending features              │
│                                                                     │
└────────────────────────── [a]ll [s]ort [Enter]fv [/]filter [q]uit ──┘
```

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                           pv (single file)                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│  │   Scanner   │───▶│   Model     │───▶│   Views     │            │
│  └─────────────┘    └─────────────┘    └─────────────┘            │
│        │                  │                   │                    │
│        ▼                  ▼                   ▼                    │
│  - Walk ~/Code       - Project         - Dashboard                 │
│  - Find features.json- Portfolio       - Project list              │
│  - Parse JSON        - Aggregates      - Velocity chart            │
│  - Compute metrics   - Sorting         - Attention alerts          │
│                                                                    │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐            │
│  │   Render    │◀───│   State     │───▶│   Input     │            │
│  └─────────────┘    └─────────────┘    └─────────────┘            │
│        │                  │                   │                    │
│        ▼                  ▼                   ▼                    │
│  - ANSI colors       - Sort mode       - j/k navigation            │
│  - Box drawing       - Filter mode     - Enter → fv                │
│  - Layout            - Selection       - s → cycle sort            │
│                      - Scroll          - a → toggle all            │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Scanner & Data Model

- [x] Create script skeleton with argument parsing (`pv`, `pv --help`)
- [x] Implement recursive scanner for `~/Code/**/features.json`
- [x] Build `Project` dataclass with computed properties
- [x] Build `Portfolio` model with aggregates
- [x] Basic ANSI helpers (reuse from fv pattern)

```python
def scan_projects(root: str = os.path.expanduser('~/Code')) -> list[Project]:
    """Recursively find all features.json and compute metrics."""
    projects = []
    for dirpath, _, files in os.walk(root):
        if 'features.json' in files:
            path = os.path.join(dirpath, 'features.json')
            proj = Project.from_path(path)
            if proj:
                projects.append(proj)
    return projects
```

**Verification:**
```bash
./pv --debug 2>&1 | head -20
# Expected: List of found projects with metrics
```

### Phase 2: Dashboard View (Static)

- [x] Implement portfolio summary header (total projects, features, completion)
- [x] Implement project list with progress bars
- [x] Implement status indicators (active/stalled/complete)
- [x] Box-drawing frame
- [x] Truncate long project names intelligently

**Verification:**
```bash
./pv
# Expected: Dashboard renders without errors, shows all metrics
```

### Phase 3: Sorting & Filtering

- [x] Implement sort modes (pending, modified, total, completion)
- [x] Implement filter: active only (default) vs all
- [x] Implement stalled filter
- [x] Visual indicator for current sort/filter mode in footer

**Verification:**
```bash
./pv
# Press 's' multiple times - sort changes
# Press 'a' - shows 100% complete projects too
# Press 'z' - shows only stalled projects
```

### Phase 4: Interactive Navigation

- [x] Implement raw terminal input (reuse getch pattern from fv)
- [x] j/k or arrow navigation with selection highlight
- [x] Enter to launch `fv` on selected project
- [ ] Scroll for long project lists (deferred - not needed with current project count)
- [ ] `/` for fuzzy filter (deferred - future enhancement)

**Verification:**
```bash
./pv
# Navigate with j/k, press Enter on a project
# Expected: fv launches for that project's features.json
```

### Phase 5: Attention Alerts

- [x] Identify stalled projects (no changes in 14+ days with pending work)
- [x] Render attention section with warnings
- [x] Show days since last activity and pending count

**Verification:**
```bash
./pv
# Expected: Stalled projects appear in ATTENTION section with accurate day counts
```

### Phase 6: Polish

- [x] Handle edge cases (no projects found, malformed JSON)
- [x] Non-interactive mode (pipe-friendly)
- [ ] Terminal resize handling (handled dynamically in main loop)
- [x] Help overlay (`h` or `?`)
- [x] Install to ~/.local/bin/pv

**Verification:**
```bash
./pv | cat  # Non-interactive, should print once and exit
./pv --help  # Shows usage
```

---

## Code Structure

```python
#!/usr/bin/env python3
"""
pv - Project Viewer TUI

A portfolio dashboard for all projects with features.json.
Scans ~/Code, shows project health at a glance.

Usage:
    pv              # Scan ~/Code, show dashboard
    pv /path        # Scan specific directory
    pv --help       # Show help

Navigation:
    j/k or ↑/↓  Move selection
    Enter       Launch fv for selected project
    s           Cycle sort mode
    a           Toggle show all (including complete)
    z           Show only stalled projects
    /           Filter by name
    q           Quit
"""

from __future__ import annotations

import json
import os
import sys
import tty
import termios
import subprocess
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from shutil import get_terminal_size
from typing import Any

# ═══════════════════════════════════════════════════════════════════════════════
# CONSTANTS (same palette as fv for consistency)
# ═══════════════════════════════════════════════════════════════════════════════

STATUS_DONE = {'done', 'complete'}
STATUS_ACTIVE = {'in_progress'}
STATUS_PENDING = {'pending'}

COLOR_MUTED = 240
COLOR_PROJECT = 39
COLOR_HEALTHY = 34
COLOR_ACTIVE = 33
COLOR_STALLED = 131
COLOR_BORDER = 237

SORT_MODES = ['pending', 'modified', 'total', 'completion']
STALL_DAYS = 14

# ═══════════════════════════════════════════════════════════════════════════════
# DATA MODEL
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class Project:
    path: str
    name: str
    total: int = 0
    done: int = 0
    active: int = 0
    pending: int = 0
    abandoned: int = 0
    epics: set = field(default_factory=set)
    open_epics: set = field(default_factory=set)
    last_modified: datetime = None
    oldest_pending_date: str = None
    worked_today: bool = False

    @classmethod
    def from_path(cls, features_path: str) -> Project | None:
        """Load project metrics from features.json path."""
        try:
            with open(features_path) as f:
                data = json.load(f)
        except (json.JSONDecodeError, IOError):
            return None

        if not isinstance(data, list):
            return None

        # Derive project name from path
        # ~/Code/micro_apps/harvest-bloom/features.json -> micro_apps/harvest-bloom
        path = Path(features_path).parent
        code_root = Path.home() / 'Code'
        try:
            name = str(path.relative_to(code_root))
        except ValueError:
            name = path.name

        proj = cls(path=str(path), name=name)
        proj.last_modified = datetime.fromtimestamp(os.path.getmtime(features_path))
        proj.worked_today = proj.last_modified.date() == datetime.now().date()

        thirty_days_ago = datetime.now() - timedelta(days=30)

        for item in data:
            status = item.get('status', 'pending')
            epic = item.get('epic')
            created = item.get('created_at')

            proj.total += 1

            if status in STATUS_DONE:
                proj.done += 1
                # Check if recently completed (crude: use created_at as proxy)
                # In reality we'd need a completed_at field
            elif status in STATUS_ACTIVE:
                proj.active += 1
                if epic:
                    proj.open_epics.add(epic)
            elif status in STATUS_PENDING:
                proj.pending += 1
                if epic:
                    proj.open_epics.add(epic)
                if created:
                    if not proj.oldest_pending_date or created < proj.oldest_pending_date:
                        proj.oldest_pending_date = created
            else:
                proj.abandoned += 1

            if epic:
                proj.epics.add(epic)

        return proj

    @property
    def percent(self) -> float:
        return (self.done / self.total * 100) if self.total else 0

    @property
    def is_complete(self) -> bool:
        return self.pending == 0 and self.active == 0

    @property
    def is_stalled(self) -> bool:
        if self.is_complete:
            return False
        if not self.last_modified:
            return True
        days_since = (datetime.now() - self.last_modified).days
        return days_since >= STALL_DAYS

    @property
    def has_open_work(self) -> bool:
        return self.active > 0 or self.pending > 0


@dataclass
class Portfolio:
    projects: list[Project]

    @property
    def total_projects(self) -> int:
        return len(self.projects)

    @property
    def total_features(self) -> int:
        return sum(p.total for p in self.projects)

    @property
    def total_done(self) -> int:
        return sum(p.done for p in self.projects)

    @property
    def active_projects(self) -> int:
        return sum(1 for p in self.projects if p.active > 0)

    @property
    def stalled_projects(self) -> int:
        return sum(1 for p in self.projects if p.is_stalled)

    @property
    def complete_projects(self) -> int:
        return sum(1 for p in self.projects if p.is_complete)

    def sorted_by(self, mode: str) -> list[Project]:
        if mode == 'pending':
            return sorted(self.projects, key=lambda p: -p.pending)
        elif mode == 'modified':
            return sorted(self.projects, key=lambda p: p.last_modified or datetime.min, reverse=True)
        elif mode == 'total':
            return sorted(self.projects, key=lambda p: -p.total)
        elif mode == 'completion':
            return sorted(self.projects, key=lambda p: p.percent)
        return self.projects

    def filtered(self, show_all: bool = False, stalled_only: bool = False) -> list[Project]:
        if stalled_only:
            return [p for p in self.projects if p.is_stalled]
        if show_all:
            return self.projects
        return [p for p in self.projects if p.has_open_work]


def scan_projects(root: str) -> Portfolio:
    """Recursively find all features.json and build portfolio."""
    projects = []
    root_path = Path(root).expanduser()

    for features_path in root_path.rglob('features.json'):
        # Skip node_modules, .git, etc.
        if any(part.startswith('.') or part == 'node_modules' for part in features_path.parts):
            continue
        proj = Project.from_path(str(features_path))
        if proj and proj.total > 0:
            projects.append(proj)

    return Portfolio(projects=projects)


# ═══════════════════════════════════════════════════════════════════════════════
# ANSI RENDERING (copy from fv - same utilities)
# ═══════════════════════════════════════════════════════════════════════════════

def ansi(text: str, color: int | None = None, bold: bool = False) -> str:
    """Wrap text in ANSI escape codes."""
    # ... (same as fv)

def progress_bar(done: int, total: int, width: int = 40) -> str:
    """Render progress bar with block characters."""
    # ... (same as fv)

def truncate(text: str, width: int) -> str:
    """Truncate text to width, adding ellipsis."""
    # ... (same as fv)

def frame(lines: list[str], width: int, title: str = '', footer: str = '') -> list[str]:
    """Wrap lines in a box frame."""
    # ... (same as fv)

def section_header(title: str, width: int) -> str:
    """Create a section header with title and line."""
    # ... (same as fv)


# ═══════════════════════════════════════════════════════════════════════════════
# VIEWS
# ═══════════════════════════════════════════════════════════════════════════════

def view_dashboard(portfolio: Portfolio, state: State, width: int, height: int) -> list[str]:
    """Render main portfolio dashboard."""
    lines = []
    inner = width - 4

    # Portfolio summary
    lines.append('')
    lines.append(section_header('PORTFOLIO', inner))
    lines.append('')

    pct = (portfolio.total_done / portfolio.total_features * 100) if portfolio.total_features else 0
    bar_width = min(40, inner - 40)
    lines.append(f"  {portfolio.total_projects} projects   {portfolio.total_features} features   "
                 f"{progress_bar(portfolio.total_done, portfolio.total_features, bar_width)}  "
                 f"{portfolio.total_done} done ({pct:.0f}%)")

    status = []
    if portfolio.active_projects:
        status.append(ansi(f"● {portfolio.active_projects} active", COLOR_ACTIVE))
    if portfolio.stalled_projects:
        status.append(ansi(f"○ {portfolio.stalled_projects} stalled", COLOR_STALLED))
    if portfolio.complete_projects:
        status.append(ansi(f"✓ {portfolio.complete_projects} complete", COLOR_HEALTHY))
    lines.append('  ' + '    '.join(status))

    # Project list
    lines.append('')
    lines.append(section_header(f'PROJECTS (sorted by {state.sort_mode})', inner))
    lines.append('')

    filtered = portfolio.filtered(state.show_all, state.stalled_only)
    sorted_projects = portfolio.sorted_by(state.sort_mode)
    display = [p for p in sorted_projects if p in filtered]

    for i, proj in enumerate(display):
        cursor = ansi('▸', COLOR_PROJECT, bold=True) if i == state.selected else ' '
        name = truncate(proj.name, 14).ljust(14)
        bar = progress_bar(proj.done, proj.total, 18)
        count = f"{proj.done}/{proj.total}".rjust(7)
        pct = f"{proj.percent:3.0f}%"

        # Status indicator
        if proj.is_complete:
            status = ansi('✓ complete', COLOR_HEALTHY)
        elif proj.is_stalled:
            status = ansi('○ stalled', COLOR_STALLED)
        elif proj.active:
            status = ansi(f'● {proj.active} active', COLOR_ACTIVE)
        else:
            status = ansi(f'○ {proj.pending} pending', COLOR_MUTED)

        # Last modified + today indicator
        if proj.last_modified:
            mod = proj.last_modified.strftime('%b %d')
        else:
            mod = '   -  '
        today_mark = ansi('◆', COLOR_ACTIVE) if proj.worked_today else ' '

        lines.append(f" {cursor}{ansi(name, COLOR_PROJECT)}  {bar}  {count} {pct}  {status}  {today_mark} {mod}")

    if not display:
        lines.append(f"  {ansi('No projects match current filter', COLOR_MUTED)}")

    # Attention section (stalled projects with pending work)
    stalled = [p for p in portfolio.projects if p.is_stalled]
    if stalled and not state.stalled_only:
        lines.append('')
        lines.append(section_header('ATTENTION', inner))
        lines.append('')
        for proj in stalled[:3]:
            days = (datetime.now() - proj.last_modified).days if proj.last_modified else '?'
            lines.append(f"  {ansi('⚠', COLOR_STALLED)} {proj.name}: stalled {days} days, {proj.pending} pending")

    lines.append('')
    return lines


# ═══════════════════════════════════════════════════════════════════════════════
# STATE & INPUT
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class State:
    selected: int = 0
    sort_mode: str = 'pending'
    show_all: bool = False
    stalled_only: bool = False
    filter_text: str = ''
    scroll: int = 0


def render(state: State, portfolio: Portfolio, width: int, height: int) -> str:
    """Render current view to string."""
    title = 'pv'
    footer = f'[a]ll [s]ort:{state.sort_mode} [z]stalled [Enter]fv [q]uit'
    lines = view_dashboard(portfolio, state, width, height)
    framed = frame(lines, width, title, footer)
    return '\n'.join(framed)


def handle_input(key: str, state: State, portfolio: Portfolio) -> State | str | None:
    """Process input. Returns new state, 'fv:<path>' to launch fv, or None to quit."""

    if key in ('q', '\x03'):
        return None

    if key in ('j', 'down'):
        filtered = portfolio.filtered(state.show_all, state.stalled_only)
        state.selected = min(state.selected + 1, len(filtered) - 1)
    elif key in ('k', 'up'):
        state.selected = max(state.selected - 1, 0)

    elif key == 's':
        idx = SORT_MODES.index(state.sort_mode)
        state.sort_mode = SORT_MODES[(idx + 1) % len(SORT_MODES)]
        state.selected = 0

    elif key == 'a':
        state.show_all = not state.show_all
        state.stalled_only = False
        state.selected = 0

    elif key == 'z':
        state.stalled_only = not state.stalled_only
        state.show_all = False
        state.selected = 0

    elif key in ('\r', '\n'):
        filtered = portfolio.filtered(state.show_all, state.stalled_only)
        sorted_projects = portfolio.sorted_by(state.sort_mode)
        display = [p for p in sorted_projects if p in filtered]
        if display and 0 <= state.selected < len(display):
            proj = display[state.selected]
            return f'fv:{proj.path}'

    return state


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    root = '~/Code'
    if len(sys.argv) > 1:
        if sys.argv[1] in ('-h', '--help'):
            print(__doc__)
            return
        root = sys.argv[1]

    portfolio = scan_projects(root)

    if not portfolio.projects:
        print(f"No projects with features.json found in {root}")
        sys.exit(1)

    state = State()
    size = get_terminal_size()

    # Non-interactive mode
    if not sys.stdin.isatty():
        output = render(state, portfolio, size.columns, size.lines)
        print(output)
        return

    # Interactive loop
    print('\033[2J\033[H\033[?25l', end='')

    try:
        while True:
            size = get_terminal_size()
            output = render(state, portfolio, size.columns, size.lines)
            print(f'\033[H{output}', end='', flush=True)

            key = getch()
            result = handle_input(key, state, portfolio)

            if result is None:
                break
            elif isinstance(result, str) and result.startswith('fv:'):
                # Launch fv for selected project
                path = result[3:]
                print('\033[?25h\033[2J\033[H', end='')
                subprocess.run(['fv', os.path.join(path, 'features.json')])
                print('\033[2J\033[H\033[?25l', end='')
            else:
                state = result
    finally:
        print('\033[?25h\033[2J\033[H', end='')


if __name__ == '__main__':
    main()
```

---

## Installation

```bash
# Save to ~/.local/bin/pv
chmod +x ~/.local/bin/pv

# Requires fv to be installed for drill-down
# pv
```

---

## Verification Strategy

### Phase 1 - Scanner
```bash
python3 -c "
import sys; sys.path.insert(0, '.')
from pv import scan_projects
p = scan_projects('~/Code')
print(f'Found {len(p.projects)} projects')
for proj in p.projects[:5]:
    print(f'  {proj.name}: {proj.done}/{proj.total}')
"
# Expected: Lists projects with correct counts
```

### Phase 2 - Dashboard
```bash
./pv 2>&1 | head -30
# Expected: Renders dashboard with PORTFOLIO and PROJECTS sections
```

### Phase 3 - Sorting/Filtering
```bash
./pv
# Press 's' repeatedly - footer shows sort mode changing
# Press 'a' - complete projects appear
# Press 'z' - only stalled projects shown
```

### Phase 4 - Navigation
```bash
./pv
# j/k moves selection
# Enter on project launches fv (verify fv opens)
# q quits cleanly
```

### Phase 5 - Attention
```bash
./pv
# Stalled projects should show in ATTENTION section
# Verify days calculation is reasonable
```

---

## Future Enhancements (Out of Scope)

- Watch mode (auto-refresh)
- Export to markdown/HTML
- Project grouping by directory
- Git integration (last commit vs features.json mtime)
- Comparison view (two points in time)
- Velocity sparklines (requires completed_at timestamps in features.json)
