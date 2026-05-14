#!/usr/bin/env python3
"""
fv - Feature Viewer TUI

A terminal dashboard for features.json tracking files.
Zero dependencies, pure Python 3.10+ stdlib.

Usage:
    fv                    # View features.json in current directory
    fv path/to/file.json  # View specific file
    fv --help             # Show help

Navigation:
    j/k or ↑/↓  Move selection
    Enter/e     View epic details
    f           View feature details (from epic view)
    b/Esc       Go back
    h/?         Show help
    q           Quit

Install:
    chmod +x fv
    mv fv ~/.local/bin/
    # Or: alias fv='python3 /path/to/fv'
"""

from __future__ import annotations

import json
import os
import re
import sys
import tty
import termios
from dataclasses import dataclass, field
from shutil import get_terminal_size
from typing import Any
from datetime import datetime

# Regex to strip ANSI escape codes for visible length calculation
ANSI_ESCAPE = re.compile(r'\033\[[0-9;]*m')

# ═══════════════════════════════════════════════════════════════════════════════
# CONSTANTS
# ═══════════════════════════════════════════════════════════════════════════════

STATUS_DONE = {'done', 'complete'}
STATUS_ACTIVE = {'in_progress'}
STATUS_PENDING = {'pending'}

STATUS_SYMBOL = {
    'done': '✓', 'complete': '✓',
    'in_progress': '◉',
    'pending': '○',
    'abandoned': '✗',
    'superseded': '↷',
}

STATUS_COLOR = {
    'done': 34, 'complete': 34,
    'in_progress': 33,
    'pending': 245,
    'abandoned': 238,
    'superseded': 238,
}

COLOR_MUTED = 240
COLOR_EPIC = 39
COLOR_DEP = 213
COLOR_BORDER = 237

BOX = {
    'tl': '┌', 'tr': '┐', 'bl': '└', 'br': '┘',
    'h': '─', 'v': '│', 'title': '═',
}

BLOCKS = ' ▏▎▍▌▋▊▉█'
SPARK = '▁▂▃▄▅▆▇█'


# ═══════════════════════════════════════════════════════════════════════════════
# ANSI RENDERING
# ═══════════════════════════════════════════════════════════════════════════════

def ansi(text: str, color: int | None = None, bold: bool = False, dim: bool = False) -> str:
    """Wrap text in ANSI escape codes."""
    if not (color or bold or dim):
        return text
    codes = []
    if bold:
        codes.append('1')
    if dim:
        codes.append('2')
    if color:
        codes.append(f'38;5;{color}')
    return f"\033[{';'.join(codes)}m{text}\033[0m"


def visible_len(text: str) -> int:
    """Get visible length of text, stripping ANSI codes."""
    return len(ANSI_ESCAPE.sub('', text))


def progress_bar(done: int, total: int, width: int = 40) -> str:
    """Render progress bar with fine-grained blocks."""
    if total == 0:
        return ansi('░' * width, COLOR_MUTED)

    ratio = done / total
    filled_full = int(ratio * width)
    remainder = (ratio * width) - filled_full
    partial_idx = int(remainder * 8)

    filled_chars = filled_full
    bar = '█' * filled_full
    if filled_full < width and partial_idx > 0:
        bar += BLOCKS[partial_idx]
        filled_chars += 1
    bar += '░' * (width - filled_chars)

    # Color: green for filled portion, gray for remaining
    done_part = ansi(bar[:filled_chars], 34)
    remaining = ansi(bar[filled_chars:], COLOR_MUTED)
    return done_part + remaining


def truncate(text: str, width: int) -> str:
    """Truncate text to width, adding ellipsis if needed."""
    if len(text) <= width:
        return text
    return text[:width - 1] + '…'


# ═══════════════════════════════════════════════════════════════════════════════
# DATA MODEL
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class Feature:
    id: str
    status: str
    title: str = ''
    description: str = ''
    epic: str | None = None
    depends_on: list[str] = field(default_factory=list)
    priority: int | None = None
    created_at: str | None = None
    spec_file: str | None = None
    steps: list[str] = field(default_factory=list)
    discovered_from: str | None = None
    notes: str | None = None

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Feature:
        title = d.get('title') or d.get('name') or d.get('description', '')[:60] or d['id']
        priority = d.get('priority')
        if isinstance(priority, str):
            priority = {'low': 3, 'medium': 2, 'high': 1, 'critical': 0}.get(priority.lower())

        return cls(
            id=d['id'],
            status=d.get('status', 'pending'),
            title=title,
            description=d.get('description', ''),
            epic=d.get('epic'),
            depends_on=d.get('depends_on', []),
            priority=priority,
            created_at=d.get('created_at'),
            spec_file=d.get('spec_file'),
            steps=d.get('steps', []),
            discovered_from=d.get('discovered_from'),
            notes=d.get('notes'),
        )

    @property
    def is_done(self) -> bool:
        return self.status in STATUS_DONE

    @property
    def is_active(self) -> bool:
        return self.status in STATUS_ACTIVE

    @property
    def is_pending(self) -> bool:
        return self.status in STATUS_PENDING


@dataclass
class Epic:
    name: str
    features: list[Feature] = field(default_factory=list)

    @property
    def done(self) -> int:
        return sum(1 for f in self.features if f.is_done)

    @property
    def active(self) -> int:
        return sum(1 for f in self.features if f.is_active)

    @property
    def pending(self) -> int:
        return sum(1 for f in self.features if f.is_pending)

    @property
    def total(self) -> int:
        return len(self.features)

    @property
    def percent(self) -> float:
        return (self.done / self.total * 100) if self.total else 0


@dataclass
class Model:
    features: dict[str, Feature]
    epics: dict[str, Epic]
    activity: dict[str, list[str]]

    @classmethod
    def load(cls, path: str) -> Model:
        with open(path) as f:
            data = json.load(f)

        features = {}
        epics: dict[str, Epic] = {}
        activity: dict[str, list[str]] = {}

        for item in data:
            feat = Feature.from_dict(item)
            features[feat.id] = feat

            epic_name = feat.epic or '(no epic)'
            if epic_name not in epics:
                epics[epic_name] = Epic(name=epic_name)
            epics[epic_name].features.append(feat)

            if feat.created_at:
                if feat.created_at not in activity:
                    activity[feat.created_at] = []
                activity[feat.created_at].append(feat.id)

        epics = dict(sorted(epics.items(), key=lambda x: (-x[1].percent, x[0])))
        return cls(features=features, epics=epics, activity=activity)

    @property
    def total(self) -> int:
        return len(self.features)

    @property
    def done(self) -> int:
        return sum(1 for f in self.features.values() if f.is_done)

    @property
    def active(self) -> int:
        return sum(1 for f in self.features.values() if f.is_active)

    @property
    def pending(self) -> int:
        return sum(1 for f in self.features.values() if f.is_pending)

    def upcoming(self) -> list[Feature]:
        """Get active and pending features, sorted by priority then date."""
        upcoming = [f for f in self.features.values() if f.is_active or f.is_pending]
        return sorted(upcoming, key=lambda f: (
            0 if f.is_active else 1,
            f.priority if f.priority is not None else 999,
            f.created_at or '9999',
        ))

    def unlocks(self, feature_id: str) -> list[str]:
        """Find features that depend on this one."""
        return [f.id for f in self.features.values() if feature_id in f.depends_on]


# ═══════════════════════════════════════════════════════════════════════════════
# VIEWS
# ═══════════════════════════════════════════════════════════════════════════════

def frame(lines: list[str], width: int, title: str = '', footer: str = '') -> list[str]:
    """Wrap lines in a box frame."""
    inner_width = width - 2
    result = []

    if title:
        title_str = f' {title} '
        pad_left = 2
        pad_right = max(0, inner_width - len(title_str) - pad_left)
        top = BOX['tl'] + BOX['h'] * pad_left + title_str + BOX['h'] * pad_right + BOX['tr']
    else:
        top = BOX['tl'] + BOX['h'] * inner_width + BOX['tr']
    result.append(ansi(top, COLOR_BORDER))

    for line in lines:
        vlen = visible_len(line)
        padding = max(0, inner_width - vlen)
        result.append(ansi(BOX['v'], COLOR_BORDER) + line + ' ' * padding + ansi(BOX['v'], COLOR_BORDER))

    if footer:
        footer_str = f' {footer} '
        pad_right = 2
        pad_left = max(0, inner_width - len(footer_str) - pad_right)
        bottom = BOX['bl'] + BOX['h'] * pad_left + footer_str + BOX['h'] * pad_right + BOX['br']
    else:
        bottom = BOX['bl'] + BOX['h'] * inner_width + BOX['br']
    result.append(ansi(bottom, COLOR_BORDER))

    return result


def section_header(title: str, width: int) -> str:
    """Create a section header with title and line."""
    line_len = max(0, width - len(title) - 4)
    return f"  {ansi(title, bold=True)} {ansi(BOX['title'] * line_len, COLOR_MUTED)}"


def view_dashboard(model: Model, width: int, height: int, selected_idx: int = 0) -> list[str]:
    """Render main dashboard."""
    lines = []
    inner = width - 4

    # Overall progress
    lines.append('')
    lines.append(section_header('PROGRESS', inner))
    lines.append('')

    pct = (model.done / model.total * 100) if model.total else 0
    bar_width = min(50, inner - 20)
    lines.append(f"  {progress_bar(model.done, model.total, bar_width)}  {model.done}/{model.total}  {pct:.1f}%")

    status_parts = []
    if model.done:
        status_parts.append(ansi(f"✓ {model.done} done", STATUS_COLOR['done']))
    if model.active:
        status_parts.append(ansi(f"◉ {model.active} active", STATUS_COLOR['in_progress']))
    if model.pending:
        status_parts.append(ansi(f"○ {model.pending} pending", STATUS_COLOR['pending']))
    abandoned = sum(1 for f in model.features.values() if f.status == 'abandoned')
    if abandoned:
        status_parts.append(ansi(f"✗ {abandoned} abandoned", STATUS_COLOR['abandoned']))
    superseded = sum(1 for f in model.features.values() if f.status == 'superseded')
    if superseded:
        status_parts.append(ansi(f"↷ {superseded} superseded", STATUS_COLOR['superseded']))
    lines.append('  ' + '   '.join(status_parts))

    # Epics
    lines.append('')
    lines.append(section_header('EPICS', inner))
    lines.append('')

    for i, (epic_name, epic) in enumerate(model.epics.items()):
        bar_w = 16
        bar = progress_bar(epic.done, epic.total, bar_w)
        pct_str = f"{epic.percent:3.0f}%" if epic.total else "  -"
        name = truncate(epic_name, 12).ljust(12)
        count = f"{epic.done}/{epic.total}".rjust(5)

        status_hint = ''
        if epic.active:
            status_hint += ansi(f"  ◉ {epic.active} active", STATUS_COLOR['in_progress'])
        if epic.pending:
            status_hint += ansi(f"  ○ {epic.pending} pending", STATUS_COLOR['pending'])

        # Selection indicator
        cursor = ansi('▸', COLOR_EPIC, bold=True) if i == selected_idx else ' '
        lines.append(f" {cursor}{ansi(name, COLOR_EPIC)}  {bar}  {count} {pct_str}{status_hint}")

    # Recent activity
    lines.append('')
    lines.append(section_header('RECENT', inner))
    lines.append('')

    sorted_dates = sorted(model.activity.keys(), reverse=True)[:5]
    max_count = max((len(model.activity[d]) for d in sorted_dates), default=1)

    for date in sorted_dates:
        feature_ids = model.activity[date]
        count = len(feature_ids)
        spark_width = min(14, int(count / max_count * 14)) if max_count else 0
        spark = ansi('█' * spark_width + '░' * (14 - spark_width), 34)

        try:
            dt = datetime.fromisoformat(date)
            date_str = dt.strftime('%b %d')
        except ValueError:
            date_str = date[-5:]

        ids_preview = ', '.join(feature_ids[:3])
        if len(feature_ids) > 3:
            ids_preview += f'... (+{len(feature_ids) - 3})'

        lines.append(f"  {date_str}  {spark}  {ansi(ids_preview, COLOR_MUTED)}")

    # Next up
    lines.append('')
    lines.append(section_header('NEXT UP', inner))
    lines.append('')

    upcoming = model.upcoming()[:3]
    for feat in upcoming:
        sym = STATUS_SYMBOL.get(feat.status, '?')
        color = STATUS_COLOR.get(feat.status, 0)
        name = truncate(feat.id, 18).ljust(18)
        title = truncate(feat.title, 35).ljust(35)

        unlocks = model.unlocks(feat.id)
        unlock_str = f"→ unlocks: {', '.join(unlocks[:2])}" if unlocks else ''

        lines.append(f"  {ansi(sym, color)} {ansi(name, color)}  {title}  {ansi(unlock_str, COLOR_DEP)}")

    if not upcoming:
        lines.append(f"  {ansi('All features complete!', 34)}")

    lines.append('')
    return lines


def view_epic(model: Model, epic_name: str, width: int, height: int, selected_idx: int = 0) -> list[str]:
    """Render epic detail view."""
    epic = model.epics.get(epic_name)
    if not epic:
        return [f"  Epic '{epic_name}' not found"]

    lines = []
    inner = width - 4

    lines.append('')
    bar_w = min(50, inner - 30)
    lines.append(f"  {progress_bar(epic.done, epic.total, bar_w)}  {epic.done}/{epic.total} completed  {epic.percent:.0f}%")

    lines.append('')
    lines.append(section_header('FEATURES', inner))
    lines.append('')

    for i, feat in enumerate(sorted(epic.features, key=lambda f: f.id)):
        sym = STATUS_SYMBOL.get(feat.status, '?')
        color = STATUS_COLOR.get(feat.status, 0)
        fid = truncate(feat.id, 14).ljust(14)
        title = truncate(feat.title, 45)

        deps = ''
        if feat.depends_on:
            dep_short = [d.split('-')[-1] if '-' in d else d for d in feat.depends_on[:2]]
            deps = ansi(f"← {', '.join(dep_short)}", COLOR_DEP)

        # Selection indicator
        cursor = ansi('▸', COLOR_EPIC, bold=True) if i == selected_idx else ' '
        lines.append(f" {cursor}{ansi(sym, color)} {fid}  {title}  {deps}")

    lines.append('')
    return lines


def view_feature(model: Model, feature_id: str, width: int, height: int) -> list[str]:
    """Render feature detail view."""
    feat = model.features.get(feature_id)
    if not feat:
        return [f"  Feature '{feature_id}' not found"]

    lines = []
    inner = width - 4

    lines.append('')
    sym = STATUS_SYMBOL.get(feat.status, '?')
    color = STATUS_COLOR.get(feat.status, 0)
    lines.append(f"  {ansi(feat.title, bold=True)}")
    lines.append(f"  {ansi(f'{sym} {feat.status}', color)}")

    if feat.description:
        lines.append('')
        lines.append(section_header('DESCRIPTION', inner))
        lines.append('')
        words = feat.description.split()
        line = '  '
        for word in words:
            if len(line) + len(word) + 1 > inner:
                lines.append(line)
                line = '  '
            line += word + ' '
        if line.strip():
            lines.append(line)

    lines.append('')
    lines.append(section_header('METADATA', inner))
    lines.append('')

    if feat.epic:
        lines.append(f"  {'Epic':<12}  {ansi(feat.epic, COLOR_EPIC)}")
    if feat.priority is not None:
        prio_label = {0: 'critical', 1: 'high', 2: 'medium', 3: 'low'}.get(feat.priority, str(feat.priority))
        lines.append(f"  {'Priority':<12}  {feat.priority} ({prio_label})")
    if feat.created_at:
        lines.append(f"  {'Created':<12}  {feat.created_at}")
    if feat.spec_file:
        lines.append(f"  {'Spec':<12}  {ansi(feat.spec_file, COLOR_MUTED)}")

    lines.append('')
    lines.append(section_header('DEPENDENCIES', inner))
    lines.append('')

    if feat.depends_on:
        deps_status = []
        for dep_id in feat.depends_on:
            dep = model.features.get(dep_id)
            if dep:
                s = STATUS_SYMBOL.get(dep.status, '?')
                deps_status.append(f"{dep_id} {ansi(s, STATUS_COLOR.get(dep.status, 0))}")
            else:
                deps_status.append(f"{dep_id} ?")
        lines.append(f"  {'Blocked by:':<12}  {', '.join(deps_status)}")
    else:
        lines.append(f"  {'Blocked by:':<12}  (none)")

    unlocks = model.unlocks(feature_id)
    lines.append(f"  {'Unlocks:':<12}  {', '.join(unlocks) if unlocks else '(none)'}")

    if feat.steps:
        lines.append('')
        lines.append(section_header('STEPS', inner))
        lines.append('')
        for i, step in enumerate(feat.steps, 1):
            lines.append(f"  {i}. {truncate(step, inner - 6)}")

    lines.append('')
    return lines


def view_help(width: int, height: int) -> list[str]:
    """Render help overlay."""
    lines = []
    inner = width - 4

    lines.append('')
    lines.append(section_header('NAVIGATION', inner))
    lines.append('')
    lines.append(f"  {ansi('j', bold=True)} / {ansi('↓', bold=True)}      Move selection down")
    lines.append(f"  {ansi('k', bold=True)} / {ansi('↑', bold=True)}      Move selection up")
    lines.append(f"  {ansi('e', bold=True)} / {ansi('Enter', bold=True)}  View epic details")
    lines.append(f"  {ansi('f', bold=True)}          View feature details (from epic view)")
    lines.append(f"  {ansi('b', bold=True)} / {ansi('Esc', bold=True)}    Go back")
    lines.append(f"  {ansi('q', bold=True)}          Quit")
    lines.append('')
    lines.append(section_header('STATUS SYMBOLS', inner))
    lines.append('')
    lines.append(f"  {ansi('✓', STATUS_COLOR['done'])}  done        {ansi('◉', STATUS_COLOR['in_progress'])}  in progress")
    lines.append(f"  {ansi('○', STATUS_COLOR['pending'])}  pending     {ansi('✗', STATUS_COLOR['abandoned'])}  abandoned")
    lines.append(f"  {ansi('↷', STATUS_COLOR['superseded'])}  superseded")
    lines.append('')
    lines.append(section_header('USAGE', inner))
    lines.append('')
    lines.append(f"  {ansi('fv', bold=True)}                   View features.json in current directory")
    lines.append(f"  {ansi('fv path/to/file', bold=True)}     View specific file")
    lines.append(f"  {ansi('fv --help', bold=True)}            Show CLI help")
    lines.append('')

    return lines


# ═══════════════════════════════════════════════════════════════════════════════
# INPUT & STATE
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class State:
    view: str = 'dashboard'
    selected_epic: str | None = None
    selected_feature: str | None = None
    epic_index: int = 0
    feature_index: int = 0
    scroll: int = 0


def getch() -> str:
    """Read a single character from stdin without echo."""
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        ch = sys.stdin.read(1)
        if not ch:
            return 'q'
        if ch == '\x1b':
            ch2 = sys.stdin.read(1)
            if not ch2:
                return ch
            if ch2 == '[':
                ch3 = sys.stdin.read(1)
                if not ch3:
                    return ch
                return {'A': 'up', 'B': 'down', 'C': 'right', 'D': 'left'}.get(ch3, ch)
        return ch
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)


def handle_input(key: str, state: State, model: Model) -> State | None:
    """Process input and return new state, or None to quit."""
    # Help toggle
    if key == 'h' or key == '?':
        state.view = 'help' if state.view != 'help' else 'dashboard'
        return state

    if key in ('q', '\x03'):
        if state.view in ('dashboard', 'help'):
            return None
        state.view = 'dashboard'
        state.selected_epic = None
        state.selected_feature = None
        return state

    if key in ('\x1b', 'b', '\x7f'):
        if state.view == 'help':
            state.view = 'dashboard'
        elif state.view == 'feature':
            state.view = 'epic'
            state.selected_feature = None
        elif state.view == 'epic':
            state.view = 'dashboard'
            state.selected_epic = None
        return state

    if key in ('j', 'down'):
        if state.view == 'dashboard':
            state.epic_index = min(state.epic_index + 1, len(model.epics) - 1)
        elif state.view == 'epic' and state.selected_epic:
            epic = model.epics.get(state.selected_epic)
            if epic:
                state.feature_index = min(state.feature_index + 1, len(epic.features) - 1)
    elif key in ('k', 'up'):
        if state.view == 'dashboard':
            state.epic_index = max(state.epic_index - 1, 0)
        elif state.view == 'epic':
            state.feature_index = max(state.feature_index - 1, 0)

    elif key in ('e', '\r', '\n'):
        if state.view == 'dashboard':
            epic_names = list(model.epics.keys())
            if epic_names:
                state.selected_epic = epic_names[state.epic_index]
                state.view = 'epic'
                state.feature_index = 0

    elif key == 'f':
        if state.view == 'epic' and state.selected_epic:
            epic = model.epics.get(state.selected_epic)
            if epic and epic.features:
                sorted_features = sorted(epic.features, key=lambda f: f.id)
                state.selected_feature = sorted_features[state.feature_index].id
                state.view = 'feature'

    return state


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════════

def render(state: State, model: Model, width: int, height: int) -> str:
    """Render current view to string."""
    if state.view == 'dashboard':
        title = 'features.json'
        footer = '[e]pic [h]elp [q]uit'
        lines = view_dashboard(model, width, height, state.epic_index)
    elif state.view == 'epic':
        title = f'epic: {state.selected_epic}'
        footer = '[f]eature [b]ack [h]elp [q]uit'
        lines = view_epic(model, state.selected_epic, width, height, state.feature_index)
    elif state.view == 'feature':
        title = state.selected_feature
        footer = '[b]ack [h]elp [q]uit'
        lines = view_feature(model, state.selected_feature, width, height)
    elif state.view == 'help':
        title = 'help'
        footer = '[b]ack [q]uit'
        lines = view_help(width, height)
    else:
        lines = ['Unknown view']
        title = ''
        footer = ''

    framed = frame(lines, width, title, footer)
    return '\n'.join(framed)


def main():
    path = 'features.json'
    if len(sys.argv) > 1:
        if sys.argv[1] in ('-h', '--help'):
            print(__doc__)
            return
        path = sys.argv[1]

    if not os.path.exists(path):
        print(f"Error: {path} not found")
        print("Run from a directory containing features.json, or specify path.")
        sys.exit(1)

    try:
        model = Model.load(path)
    except json.JSONDecodeError as e:
        print(f"Error parsing {path}: {e}")
        sys.exit(1)
    except KeyError as e:
        print(f"Error: missing required field {e} in {path}")
        sys.exit(1)

    state = State()
    size = get_terminal_size()

    if not sys.stdin.isatty():
        output = render(state, model, size.columns, size.lines)
        print(output)
        return

    print('\033[2J\033[H\033[?25l', end='')

    try:
        while True:
            size = get_terminal_size()
            output = render(state, model, size.columns, size.lines)
            print(f'\033[H{output}', end='', flush=True)

            key = getch()
            state = handle_input(key, state, model)
            if state is None:
                break
    finally:
        print('\033[?25h\033[2J\033[H', end='')


if __name__ == '__main__':
    main()
