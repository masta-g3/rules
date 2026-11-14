"""Run the standalone study tool's behavioral tests with the repository checks."""

import subprocess
from pathlib import Path


def test_card_signal_tools():
    root = Path(__file__).resolve().parent.parent
    result = subprocess.run(
        ["node", "--experimental-strip-types", "--test", *map(str, sorted((root / "tests").glob("card_signal*.test.mjs")))],
        cwd=root,
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stdout + result.stderr
