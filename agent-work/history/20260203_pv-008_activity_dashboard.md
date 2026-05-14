**Feature:** pv-008 → Activity Dashboard View

# Overview

Add a portfolio-wide activity dashboard accessible via `a` key from portfolio view. Shows completion velocity through dual visualizations (GitHub-style heatmap calendar + bar chart) with comprehensive statistics.

## Context Files

**Core (modify):**
- `bin/pv` — main TUI application (~2400 lines)

**Reference (patterns):**
- `bin/pv:135-154` — `progress_bar()` for ANSI rendering patterns
- `bin/pv:174-203` — `frame()` for box drawing
- `bin/pv:237-272` — `Feature` dataclass (needs `completed_at` field)
- `bin/pv:786-799` — `view_portfolio()` for view structure
- `bin/pv:1396-1432` — `State` dataclass for state management
- `bin/pv:1435-1526` — `handle_input()` for input routing
- `bin/pv:1570-1573` — 'r' key already used for refresh (avoid conflict)

**Data:**
- `features.yaml` — sample data with `created_at` / `completed_at` fields

---

# Design Direction

## Visual Language

Following Claude Code's dashboard aesthetic:
- **Monochrome base** with selective accent colors
- **Information density** — pack meaningful data without clutter
- **Box-drawing frames** — consistent with existing pv styling
- **Status colors** — reuse existing palette (COLOR_HEALTHY=34/green, COLOR_ACTIVE=33/yellow, COLOR_MUTED=240/gray)

## Layout (80-column terminal)

```
┌── Activity ──────────────────────────────────────────────────────────────────┐
│                                                                              │
│  [Heatmap] Bar Chart  (tab to cycle)                                         │
│                                                                              │
│        Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec Jan Feb                   │
│      ┌─────────────────────────────────────────────────────┐                 │
│  Mon │ · · · · · · · · · · · · · ░ ░ ▒ ▒ ░ ▓ █ ▒ ░ ░ ▒ ▒ │                 │
│      │ · · · · · · · · · · · · · ░ ░ ▒ ░ ░ ▒ █ ▒ ░ ░ ▒ ░ │                 │
│  Wed │ · · · · · · · · · · · · · · ░ ░ ▒ ░ ▓ ▓ █ ░ ░ ░ ▒ │                 │
│      │ · · · · · · · · · · · · · · ░ ▒ ░ ░ ▒ █ ▒ ░ ░ ░ ░ │                 │
│  Fri │ · · · · · · · · · · · · · · · ░ ░ ░ ▒ ▓ ▒ ░ ░ ░ ░ │                 │
│      │ · · · · · · · · · · · · · · · · ░ ░ ▒ ▓ ▒ ░ · ░ ░ │                 │
│      └─────────────────────────────────────────────────────┘                 │
│  Less ░ ▒ ▓ █ More                                                           │
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════════     │
│                                                                              │
│  Features done: 47              Avg cycle time: 2.3 days                     │
│  Active days: 23/45             Completion rate: 78%                         │
│  Most active: Jan 19            Longest streak: 12 days                      │
│  Current streak: 5 days         Features/week: 4.2                           │
│                                                                              │
│  "You completed 47 features across 8 projects — 12% above average pace"      │
│                                                                              │
└─────────────────────────────────────────────────────── [b] back  [q] quit ───┘
```

**Bar Chart view (tab to toggle) — last 30 days, daily granularity:**

```
┌── Activity ──────────────────────────────────────────────────────────────────┐
│                                                                              │
│  Heatmap [Bar Chart]  (tab to cycle)                                         │
│                                                                              │
│  Last 30 Days                                                                │
│                                                                              │
│    4 │                     █                                                 │
│      │                     █        █                 █                      │
│    3 │           █         █        █     █           █                      │
│      │           █    █    █   █    █     █     █     █                      │
│    2 │      █    █    █    █   █    █  █  █     █  █  █  █                   │
│      │ █    █    █    █ █  █   █ █  █  █  █  █  █  █  █  █    █              │
│    1 │ █ █  █    █ █  █ █  █ █ █ █  █  █  █  █  █  █  █  █ █  █  █           │
│      │ █ █  █ █  █ █  █ █  █ █ █ █  █  █  █  █  █  █  █  █ █  █  █  █        │
│    0 └───────────────────────────────────────────────────────────────        │
│       Jan 5       Jan 12      Jan 19      Jan 26      Feb 2                  │
│                                                                              │
│  ═══════════════════════════════════════════════════════════════════════     │
│                                                                              │
│  This month: 23 features       Avg cycle time: 2.3 days                      │
│  Best day: Jan 19 (4)          vs last month: +15%                           │
│  Active days: 18/30            Current streak: 5 days                        │
│                                                                              │
└─────────────────────────────────────────────────────── [b] back  [q] quit ───┘
```

## Color Palette

```python
# Heatmap intensity (4 levels + empty)
COLOR_HEAT_0 = 236     # no activity (dark gray)
COLOR_HEAT_1 = 58      # low (olive/muted)
COLOR_HEAT_2 = 172     # medium (orange)
COLOR_HEAT_3 = 208     # high (bright orange)
COLOR_HEAT_4 = 196     # peak (red-orange)

# Alternative: match Claude Code's terracotta theme
COLOR_HEAT_1 = 95      # dusty rose
COLOR_HEAT_2 = 131     # salmon
COLOR_HEAT_3 = 173     # terracotta
COLOR_HEAT_4 = 209     # bright coral
```

## Heatmap Characters

```python
HEAT_CHARS = '·░▒▓█'  # 5 levels: none, low, medium, high, peak
```

---

# Architecture

## Data Flow

```
┌─────────────┐     ┌──────────────────┐     ┌────────────────┐
│ Portfolio   │────▶│ ActivityData     │────▶│ view_activity  │
│ (projects)  │     │ (aggregated)     │     │ (render)       │
└─────────────┘     └──────────────────┘     └────────────────┘
                           │
                    ┌──────┴──────┐
                    ▼             ▼
             ┌───────────┐ ┌───────────┐
             │ Heatmap   │ │ Bar Chart │
             │ Calendar  │ │ (daily)   │
             └───────────┘ └───────────┘
```

## Prerequisites

### Add `completed_at` to Feature dataclass

The `Feature` dataclass (line 237) needs the `completed_at` field:

```python
@dataclass
class Feature:
    id: str
    status: str
    title: str = ''
    # ... existing fields ...
    completed_at: str | None = None  # ADD THIS

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Feature:
        # ... existing code ...
        return cls(
            # ... existing fields ...
            completed_at=d.get('completed_at'),  # ADD THIS
        )
```

## New Components

### 1. `ActivityData` dataclass

Aggregates completion data across portfolio:

```python
@dataclass
class ActivityData:
    # Raw data
    completions: dict[str, int]  # date -> count
    features_with_dates: list[tuple[str, str | None, str | None]]  # (id, created, completed)

    # Computed stats
    total_done: int
    active_days: int
    total_days: int              # days since first activity
    longest_streak: int
    current_streak: int
    avg_cycle_time: float | None # days from created_at to completed_at
    most_active_day: str | None
    features_per_week: float

    @classmethod
    def from_portfolio(cls, portfolio: Portfolio) -> 'ActivityData':
        """Aggregate completion data from all projects.

        Must load each project's Model to access completed_at dates.
        """
        completions: dict[str, int] = {}
        features_with_dates = []

        for proj in portfolio.projects:
            model = proj.load_detail()  # Load full feature data
            for feat in model.features.values():
                if feat.completed_at:
                    d = feat.completed_at
                    completions[d] = completions.get(d, 0) + 1
                    features_with_dates.append((feat.id, feat.created_at, feat.completed_at))

        # Compute stats from all data
        stats = compute_activity_stats(completions, features_with_dates)

        return cls(completions=completions, features_with_dates=features_with_dates, **stats)
```

### 2. State Integration (no separate ActivityState)

Add fields directly to `State` dataclass (simpler, matches existing patterns):

```python
@dataclass
class State:
    # ... existing fields ...

    # Activity view
    activity_data: ActivityData | None = None
    activity_chart_mode: str = 'heatmap'   # 'heatmap' | 'bar'
```

Each chart has a fixed time window optimized for its purpose:
- **Heatmap**: 1 year (shows patterns, streaks, consistency)
- **Bar chart**: 30 days (shows recent velocity, daily spikes)

### 3. View Functions

```python
def view_activity(data: ActivityData, state: State,
                  width: int, height: int) -> list[str]:
    """Main activity view renderer."""
    ...

def render_heatmap(completions: dict[str, int],
                   width: int, range_days: int | None) -> list[str]:
    """GitHub-style contribution calendar."""
    ...

def render_bar_chart(completions: dict[str, int],
                     width: int, height: int = 8,
                     range_days: int | None = None) -> list[str]:
    """Weekly bar chart showing completion velocity."""
    ...

def render_activity_stats(data: ActivityData, width: int) -> list[str]:
    """Two-column stats layout."""
    ...
```

---

# Implementation Details

## Heatmap Calendar Algorithm

The heatmap shows 52 weeks (1 year) with days as rows (Mon-Sat) and weeks as columns:

```python
def render_heatmap(completions: dict[str, int], width: int,
                   range_days: int | None = None) -> list[str]:
    today = date.today()

    # Determine date range
    if range_days:
        start_date = today - timedelta(days=range_days)
    else:
        start_date = today - timedelta(days=365)

    # Find max for intensity scaling
    max_count = max(completions.values()) if completions else 1

    # Build grid: 7 rows (days) × ~52 columns (weeks)
    # Align to start of week (Monday)
    grid_start = start_date - timedelta(days=start_date.weekday())

    lines = []

    # Month labels
    months = []
    current = grid_start
    while current <= today:
        if current.day <= 7:  # First week of month
            months.append((current, current.strftime('%b')))
        current += timedelta(days=7)
    # Render month header...

    # Day rows
    HEAT_CHARS = '·░▒▓█'
    HEAT_COLORS = [236, 95, 131, 173, 209]

    for day_of_week in [0, 2, 4]:  # Mon, Wed, Fri
        row_label = ['Mon', '', 'Wed', '', 'Fri', '', ''][day_of_week]
        cells = []

        current = grid_start + timedelta(days=day_of_week)
        while current <= today:
            date_str = current.strftime('%Y-%m-%d')
            count = completions.get(date_str, 0)

            # Quantize to 0-4 intensity
            if count == 0:
                level = 0
            else:
                level = min(4, 1 + int(count / max_count * 3))

            char = HEAT_CHARS[level]
            color = HEAT_COLORS[level]
            cells.append(ansi(char, color))

            current += timedelta(days=7)

        lines.append(f"  {row_label:3} {''.join(cells)}")

    # Legend
    legend = "  Less " + ''.join(ansi(c, HEAT_COLORS[i])
                                  for i, c in enumerate(HEAT_CHARS[1:])) + " More"
    lines.append(legend)

    return lines
```

## Bar Chart Algorithm

Shows features completed per **day** for last 30 days (recent velocity focus):

```python
def render_bar_chart(completions: dict[str, int], width: int,
                     height: int = 8) -> list[str]:
    """Render daily completion bar chart for last 30 days.

    Complements heatmap (long-term) with short-term daily detail.
    Fixed 30-day window regardless of range filter.
    """
    today = date.today()
    days = 30

    # Collect daily counts
    daily = []
    for i in range(days, -1, -1):
        d = today - timedelta(days=i)
        date_str = d.strftime('%Y-%m-%d')
        daily.append((d, completions.get(date_str, 0)))

    # Fit to available width (each day = 2 chars for readability)
    available = (width - 12) // 2  # margins + y-axis, 2 chars per bar
    if len(daily) > available:
        daily = daily[-available:]

    max_count = max(c for _, c in daily) if daily else 1
    if max_count == 0:
        max_count = 1

    lines = []

    # Y-axis labels + bars (top to bottom)
    for row in range(height, 0, -1):
        threshold = max_count * row / height
        if row == height:
            label = f"{max_count:3}"
        elif row == 1:
            label = "  0"
        else:
            label = "   "

        cells = []
        for _, count in daily:
            if count >= threshold:
                cells.append(ansi('█', COLOR_HEALTHY))
            else:
                cells.append(' ')

        lines.append(f"  {label} │{' '.join(cells)}")  # space between bars

    # X-axis
    bar_width = len(daily) * 2 - 1
    lines.append(f"      └{'─' * bar_width}")

    # Date labels (show every ~week)
    date_line = "       "
    for i, (d, _) in enumerate(daily):
        if i % 7 == 0:
            date_line += d.strftime('%b %-d').ljust(14)
    lines.append(date_line)

    return lines
```

## Statistics Calculations

```python
def compute_activity_stats(completions: dict[str, int],
                           features: list[tuple[str, str | None, str | None]]
                          ) -> dict:
    """Compute activity statistics from completion data.

    Args:
        completions: date string -> count mapping
        features: list of (id, created_at, completed_at) tuples
    """
    today = date.today()
    dates = sorted(completions.keys())

    if not dates:
        return {
            'total_done': 0, 'active_days': 0, 'total_days': 0,
            'longest_streak': 0, 'current_streak': 0,
            'avg_cycle_time': None, 'most_active_day': None,
            'features_per_week': 0.0,
        }

    first_date = datetime.strptime(dates[0], '%Y-%m-%d').date()
    total_days = (today - first_date).days + 1

    # Streaks - iterate backwards from today to find current streak
    # then forward from start to find longest streak
    longest_streak = 0
    current_streak = 0
    streak = 0

    # Current streak: count consecutive days ending at today
    for i in range(total_days):
        d = today - timedelta(days=i)
        date_str = d.strftime('%Y-%m-%d')
        if completions.get(date_str, 0) > 0:
            current_streak += 1
        else:
            break  # Streak broken

    # Longest streak: scan entire range
    for i in range(total_days):
        d = first_date + timedelta(days=i)
        date_str = d.strftime('%Y-%m-%d')
        if completions.get(date_str, 0) > 0:
            streak += 1
            longest_streak = max(longest_streak, streak)
        else:
            streak = 0

    # Cycle time (created_at → completed_at)
    cycle_times = []
    for _, created, completed in features:
        if created and completed:
            try:
                c = datetime.strptime(created, '%Y-%m-%d')
                d = datetime.strptime(completed, '%Y-%m-%d')
                cycle_times.append((d - c).days)
            except ValueError:
                pass  # Skip malformed dates

    avg_cycle = sum(cycle_times) / len(cycle_times) if cycle_times else None

    # Most active day
    most_active = max(completions.items(), key=lambda x: x[1])[0] if completions else None

    # Velocity
    weeks = total_days / 7
    features_per_week = sum(completions.values()) / weeks if weeks > 0 else 0.0

    return {
        'total_done': sum(completions.values()),
        'active_days': len([d for d, c in completions.items() if c > 0]),
        'total_days': total_days,
        'longest_streak': longest_streak,
        'current_streak': current_streak,
        'avg_cycle_time': avg_cycle,
        'most_active_day': most_active,
        'features_per_week': features_per_week,
    }
```

## State Integration

Add to `State` dataclass:

```python
@dataclass
class State:
    # ... existing fields ...

    # Activity view
    activity: ActivityState | None = None
    activity_data: ActivityData | None = None
```

## Input Handling

Add 'a' key handler in `handle_portfolio_input`:

```python
def handle_portfolio_input(key: str, state: State) -> State:
    # ... existing handlers ...

    elif key == 'a':
        # Enter activity view
        state.activity_data = ActivityData.from_portfolio(state.portfolio)
        state.activity_chart_mode = 'heatmap'
        state.view = 'activity'
```

Add new handler for activity view:

```python
def handle_activity_input(key: str, state: State) -> State:
    # Tab/arrows: toggle chart mode
    if key in ('\t', 'left', 'right', 'h', 'l'):
        state.activity_chart_mode = (
            'bar' if state.activity_chart_mode == 'heatmap' else 'heatmap'
        )

    return state
```

Update main `handle_input` routing:

```python
def handle_input(key: str, state: State) -> State | None:
    # ... existing code ...

    # Back navigation - add activity case
    if key in ('\x1b', 'b', '\x7f'):
        # ...
        elif state.view == 'activity':
            state.view = 'portfolio'
            state.activity_data = None
        # ...

    # View-specific routing
    # ...
    elif state.view == 'activity':
        return handle_activity_input(key, state)
```

---

# Implementation Phases

## Phase 1: Data Layer
- [x] Add `completed_at` field to `Feature` dataclass and `from_dict()`
- [x] Add `ActivityData` dataclass with `from_portfolio()` class method
- [x] Add `compute_activity_stats()` function
- [x] Add activity fields to `State` (activity_data, activity_chart_mode)

**Verification:** Run `pv`, confirm no crashes. Temporarily print completions dict in `from_portfolio()` to verify data loads.

## Phase 2: Heatmap View (1 year)
- [x] Add heatmap color constants (COLOR_HEAT_0 through COLOR_HEAT_4)
- [x] Add HEAT_CHARS constant
- [x] Implement `render_heatmap()` function (365 days)
- [x] Implement `view_activity()` with heatmap-only mode
- [x] Add 'a' key handler in `handle_portfolio_input`
- [x] Add activity view routing in `handle_input`
- [x] Add back navigation from activity view

**Verification:** Press 'a' from portfolio, see heatmap calendar. Press 'b' to return.

## Phase 3: Bar Chart View (30 days)
- [x] Implement `render_bar_chart()` function (daily, 30 days)
- [x] Add chart mode toggle (tab key)
- [x] Update `view_activity()` to switch between chart modes
- [x] Add mode indicator in header (highlight selected tab)

**Verification:** Toggle between heatmap and bar chart with tab key.

## Phase 4: Statistics Panel
- [x] Implement `render_activity_stats()` two-column layout
- [x] Heatmap stats: total done, active days, longest/current streak, features/week
- [x] Bar chart stats: this month count, best day, vs last month %, active days
- [x] Format dates and numbers nicely

**Verification:** Verify stats display correctly, stats change when switching chart mode.

## Phase 5: Polish
- [x] Add footer with keybindings ([tab] chart [b] back)
- [x] Handle edge cases (no data, single completion)
- [ ] Add encouraging message based on stats (skipped - not critical)
- [x] Update help view with activity keybindings

**Verification:** Full end-to-end test with real data across multiple projects.

---

# Edge Cases

1. **No completed_at data**: Show "No completion data yet" with tip to use `/commit` command
2. **Single completion**: Handle division by zero in stats, show "1 feature completed"
3. **Sparse data**: Heatmap handles gaps gracefully with empty cells
4. **Narrow terminal**: Truncate heatmap weeks, reduce bar chart days
5. **No portfolio mode**: Activity view requires portfolio; disable 'a' key in direct project mode (fv)

---

# Testing Strategy

1. **Unit test data aggregation**: Create mock portfolio with known completions, verify counts
2. **Visual verification**: Run pv against rules/ repo, verify heatmap shows cmd-002 completion
3. **Range filtering**: Verify 7d/30d filters exclude older completions
4. **Stat accuracy**: Manually verify streak calculations against calendar

---

# Future Enhancements (Out of Scope)

- Per-project activity view (drill down from portfolio activity)
- Epic-level breakdown in stats
- Export activity data to JSON
- Backfill completed_at from git history
