#!/usr/bin/env bash
# Claude Code Statusline — TUI-grade design with correct stdin JSON input

set -o pipefail

# Capture stdin before heredoc consumes it
INPUT_JSON=$(cat)

python3 << PYEND
import json
import subprocess
from pathlib import Path

# ═══════════════════════════════════════════════════════════════════════════════
# Visual Elements — Unicode box drawing & blocks
# ═══════════════════════════════════════════════════════════════════════════════

class G:
    BLOCK_FULL = "█"
    BLOCK_7 = "▉"
    BLOCK_6 = "▊"
    BLOCK_5 = "▋"
    BLOCK_4 = "▌"
    BLOCK_3 = "▍"
    BLOCK_2 = "▎"
    BLOCK_1 = "▏"
    SHADE_LIGHT = "░"
    CIRCLE = "●"
    CIRCLE_EMPTY = "○"
    DOT = "·"
    SPARK = "⚡"

# ═══════════════════════════════════════════════════════════════════════════════
# Read JSON passed from bash
# ═══════════════════════════════════════════════════════════════════════════════

data = json.loads('''$INPUT_JSON''')

ctx = data.get("context_window", {})
ctx_size = ctx["context_window_size"]
current_usage = ctx.get("current_usage")

model = data.get("model", {}).get("display_name", "Claude").upper()
session_cost = data.get("cost", {}).get("total_cost_usd", 0)

# Use current_usage to calculate actual context window utilization
# current_usage is null if no messages yet
if current_usage:
    used = (
        current_usage.get("input_tokens", 0) +
        current_usage.get("output_tokens", 0) +
        current_usage.get("cache_creation_input_tokens", 0) +
        current_usage.get("cache_read_input_tokens", 0)
    )
else:
    used = 0

AUTOCOMPACT_BUFFER = 45_000
effective_total = ctx_size - AUTOCOMPACT_BUFFER
pct_used = int(used * 100 / effective_total) if effective_total > 0 else 0

# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════

def fmt_tokens(n):
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    elif n >= 1_000:
        return f"{n/1_000:.0f}k"
    return str(n)

def progress_bar(pct, width=12):
    """Gradient-style progress bar."""
    pct = max(0, min(100, pct))
    partials = [" ", G.BLOCK_1, G.BLOCK_2, G.BLOCK_3, G.BLOCK_4, G.BLOCK_5, G.BLOCK_6, G.BLOCK_7, G.BLOCK_FULL]

    full_blocks = int(pct * width / 100)
    remainder = (pct * width / 100) - full_blocks
    partial_idx = int(remainder * 8)

    bar = G.BLOCK_FULL * full_blocks
    if full_blocks < width:
        bar += partials[partial_idx]
        bar += G.SHADE_LIGHT * (width - full_blocks - 1)
    return bar

def get_git_info():
    try:
        subprocess.run(["git", "rev-parse", "--is-inside-work-tree"], capture_output=True, check=True, timeout=2)
        repo = Path(subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, timeout=2).stdout.strip()).name
        branch = subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True, timeout=2).stdout.strip() or "detached"
        return repo, branch
    except:
        return None, None

def get_mcp_count():
    try:
        with open(Path.home() / ".claude" / "settings.json") as f:
            return len(json.load(f).get("mcpServers", {}))
    except:
        return 0

def get_daily_cost():
    """Get today's total cost from ccusage."""
    try:
        from datetime import datetime
        result = subprocess.run(["ccusage", "--json"], capture_output=True, text=True, timeout=5)
        data = json.loads(result.stdout)
        today = datetime.now().strftime("%Y-%m-%d")
        for day in data.get("daily", []):
            if day["date"] == today:
                return day.get("totalCost", 0)
    except:
        pass
    return None

# ═══════════════════════════════════════════════════════════════════════════════
# Build statusline
# ═══════════════════════════════════════════════════════════════════════════════

sep = f"  {G.DOT}  "
parts = []

# Health indicator based on context usage
health = G.CIRCLE if pct_used < 80 else G.CIRCLE_EMPTY
parts.append(f"{health} {model}")

# Context bar (the hero element)
ctx_bar = progress_bar(pct_used, width=14)
parts.append(f"ctx {ctx_bar} {pct_used:>2}% {fmt_tokens(used)}/{fmt_tokens(effective_total)}")

# Costs: session / daily
daily_cost = get_daily_cost()
sess_str = f"\${session_cost:.2f}" if session_cost < 10 else f"\${session_cost:.1f}"
if daily_cost is not None:
    daily_str = f"\${daily_cost:.2f}" if daily_cost < 10 else f"\${daily_cost:.1f}"
    parts.append(f"{sess_str}/{daily_str}")
else:
    parts.append(sess_str)

# Git info
repo, branch = get_git_info()
if repo and branch:
    parts.append(f"{repo}:{branch}")

# MCP servers
mcp = get_mcp_count()
if mcp > 0:
    parts.append(f"{mcp}{G.SPARK}")

print(sep.join(parts))
PYEND
