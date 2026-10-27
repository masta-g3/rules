import os
import re
import shutil
import tempfile

# Tests often run inside Hub-managed Pi sessions or subagents. Inherited routing
# variables would change extension behavior or reach live agent state.
for key in [key for key in os.environ if re.match(r"PI_(AGENT_HUB|TMUX_SUBAGENTS|SUBAGENT)_", key)]:
    del os.environ[key]

_agent_dir = tempfile.mkdtemp(prefix="rules-test-agent-")
os.environ["PI_CODING_AGENT_DIR"] = _agent_dir


def pytest_unconfigure(config):
    shutil.rmtree(_agent_dir, ignore_errors=True)
