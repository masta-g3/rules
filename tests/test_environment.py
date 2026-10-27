import os
import re
import tempfile
from pathlib import Path


def test_tests_never_inherit_live_hub_or_subagent_state():
    assert [key for key in os.environ if re.match(r"PI_(AGENT_HUB|TMUX_SUBAGENTS|SUBAGENT)_", key)] == []
    assert Path(os.environ["PI_CODING_AGENT_DIR"]).resolve().is_relative_to(Path(tempfile.gettempdir()).resolve())
