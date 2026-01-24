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
    h/?         Show help
    q           Quit
"""

from __future__ import annotations

import json
import os
import re
import sys
import tty
import termios
import subprocess
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from shutil import get_terminal_size
from typing import Any

ANSI_ESCAPE = re.compile(r'\033\[[0-9;]*m')

# ═══════════════════════════════════════════════════════════════════════════════
# CONSTANTS
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

BOX = {
    'tl': '┌', 'tr': '┐', 'bl': '└', 'br': '┘',
    'h': '─', 'v': '│', 'title': '═',
}

BLOCKS = ' ▏▎▍▌▋▊▉█'


# ═══════════════════════════════════════════════════════════════════════════════
# ANSI RENDERING
# ═══════════════════════════════════════════════════════════════════════════════

def ansi(text: str, color: int | None = None, bold: bool = False) -> str:
    if not (color or bold):
        return text
    codes = []
    if bold:
        codes.append('1')
    if color:
        codes.append(f'38;5;{color}')
    return f"\033[{';'.join(codes)}m{text}\033[0m"


def visible_len(text: str) -> int:
    return len(ANSI_ESCAPE.sub('', text))


def progress_bar(done: int, total: int, width: int = 40) -> str:
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

    done_part = ansi(bar[:filled_chars], COLOR_HEALTHY)
    remaining = ansi(bar[filled_chars:], COLOR_MUTED)
    return done_part + remaining


def truncate(text: str, width: int) -> str:
    if len(text) <= width:
        return text
    return text[:width - 1] + '…'


def frame(lines: list[str], width: int, title: str = '', footer: str = '') -> list[str]:
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
    line_len = max(0, width - len(title) - 4)
    return f"  {ansi(title, bold=True)} {ansi(BOX['title'] * line_len, COLOR_MUTED)}"


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
    last_modified: datetime | None = None
    oldest_pending_date: str | None = None
    worked_today: bool = False

    @classmethod
    def from_path(cls, features_path: str) -> Project | None:
        try:
            with open(features_path) as f:
                data = json.load(f)
        except (json.JSONDecodeError, IOError):
            return None

        if not isinstance(data, list):
            return None

        path = Path(features_path).parent
        code_root = Path.home() / 'Code'
        try:
            name = str(path.relative_to(code_root))
        except ValueError:
            name = path.name

        proj = cls(path=str(path), name=name)
        proj.last_modified = datetime.fromtimestamp(os.path.getmtime(features_path))
        proj.worked_today = proj.last_modified.date() == datetime.now().date()

        for item in data:
            status = item.get('status', 'pending')
            epic = item.get('epic')
            created = item.get('created_at')

            proj.total += 1

            if status in STATUS_DONE:
                proj.done += 1
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
    projects = []
    root_path = Path(root).expanduser()

    for features_path in root_path.rglob('features.json'):
        if any(part.startswith('.') or part == 'node_modules' for part in features_path.parts):
            continue
        proj = Project.from_path(str(features_path))
        if proj and proj.total > 0:
            projects.append(proj)

    return Portfolio(projects=projects)


# ═══════════════════════════════════════════════════════════════════════════════
# VIEWS
# ═══════════════════════════════════════════════════════════════════════════════

def view_dashboard(portfolio: Portfolio, state: 'State', width: int, height: int) -> list[str]:
    lines = []
    inner = width - 4

    # Portfolio summary
    lines.append('')
    lines.append(section_header('PORTFOLIO', inner))
    lines.append('')

    pct = (portfolio.total_done / portfolio.total_features * 100) if portfolio.total_features else 0
    bar_width = min(30, inner - 50)
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
    lines.append(section_header(f'PROJECTS (sort: {state.sort_mode})', inner))
    lines.append('')

    filtered = portfolio.filtered(state.show_all, state.stalled_only)
    sorted_projects = portfolio.sorted_by(state.sort_mode)
    display = [p for p in sorted_projects if p in filtered]

    for i, proj in enumerate(display):
        cursor = ansi('▸', COLOR_PROJECT, bold=True) if i == state.selected else ' '
        name = truncate(proj.name, 16).ljust(16)
        bar = progress_bar(proj.done, proj.total, 16)
        count = f"{proj.done}/{proj.total}".rjust(7)
        pct_str = f"{proj.percent:3.0f}%"

        if proj.is_complete:
            status_str = ansi('✓ complete', COLOR_HEALTHY)
        elif proj.is_stalled:
            status_str = ansi('○ stalled ', COLOR_STALLED)
        elif proj.active:
            status_str = ansi(f'● {proj.active} active', COLOR_ACTIVE)
        else:
            status_str = ansi(f'○ {proj.pending} pending', COLOR_MUTED)

        if proj.last_modified:
            mod = proj.last_modified.strftime('%b %d')
        else:
            mod = '   -  '
        today_mark = ansi('◆', COLOR_ACTIVE) if proj.worked_today else ' '

        lines.append(f" {cursor}{ansi(name, COLOR_PROJECT)}  {bar}  {count} {pct_str}  {status_str}  {today_mark} {mod}")

    if not display:
        lines.append(f"  {ansi('No projects match current filter', COLOR_MUTED)}")

    # Attention section
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


def view_help(width: int, height: int) -> list[str]:
    lines = []
    inner = width - 4

    lines.append('')
    lines.append(section_header('NAVIGATION', inner))
    lines.append('')
    lines.append(f"  {ansi('j', bold=True)} / {ansi('↓', bold=True)}      Move selection down")
    lines.append(f"  {ansi('k', bold=True)} / {ansi('↑', bold=True)}      Move selection up")
    lines.append(f"  {ansi('Enter', bold=True)}      Launch fv for selected project")
    lines.append(f"  {ansi('s', bold=True)}          Cycle sort mode")
    lines.append(f"  {ansi('a', bold=True)}          Toggle show all projects")
    lines.append(f"  {ansi('z', bold=True)}          Show only stalled projects")
    lines.append(f"  {ansi('h', bold=True)} / {ansi('?', bold=True)}      Show this help")
    lines.append(f"  {ansi('q', bold=True)}          Quit")
    lines.append('')
    lines.append(section_header('INDICATORS', inner))
    lines.append('')
    lines.append(f"  {ansi('●', COLOR_ACTIVE)}  active work    {ansi('○', COLOR_STALLED)}  stalled (>{STALL_DAYS}d)")
    lines.append(f"  {ansi('✓', COLOR_HEALTHY)}  complete       {ansi('◆', COLOR_ACTIVE)}  worked today")
    lines.append('')
    lines.append(section_header('SORT MODES', inner))
    lines.append('')
    lines.append(f"  pending     Most pending features first")
    lines.append(f"  modified    Most recently touched first")
    lines.append(f"  total       Largest projects first")
    lines.append(f"  completion  Least complete first")
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
    view: str = 'dashboard'


def render(state: State, portfolio: Portfolio, width: int, height: int) -> str:
    if state.view == 'help':
        title = 'help'
        footer = '[b]ack [q]uit'
        lines = view_help(width, height)
    else:
        title = 'pv'
        filter_hint = ''
        if state.show_all:
            filter_hint = ' [all]'
        elif state.stalled_only:
            filter_hint = ' [stalled]'
        footer = f'[a]ll [s]ort [z]stalled [Enter]fv [h]elp [q]uit{filter_hint}'
        lines = view_dashboard(portfolio, state, width, height)
    framed = frame(lines, width, title, footer)
    return '\n'.join(framed)


def getch() -> str:
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


def handle_input(key: str, state: State, portfolio: Portfolio) -> State | str | None:
    if key in ('h', '?'):
        state.view = 'help' if state.view != 'help' else 'dashboard'
        return state

    if key in ('q', '\x03'):
        if state.view == 'help':
            state.view = 'dashboard'
            return state
        return None

    if key in ('\x1b', 'b'):
        if state.view == 'help':
            state.view = 'dashboard'
            return state

    if state.view == 'help':
        return state

    if key in ('j', 'down'):
        filtered = portfolio.filtered(state.show_all, state.stalled_only)
        sorted_projects = portfolio.sorted_by(state.sort_mode)
        display = [p for p in sorted_projects if p in filtered]
        state.selected = min(state.selected + 1, len(display) - 1)
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
        print(f"No projects with features.json found in {Path(root).expanduser()}")
        sys.exit(1)

    state = State()
    size = get_terminal_size()

    if not sys.stdin.isatty():
        output = render(state, portfolio, size.columns, size.lines)
        print(output)
        return

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
