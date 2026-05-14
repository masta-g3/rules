# pv-010 — pytest collection fix for pv tests

## Outcome

Restored a clean default test run for the repository by removing the pytest collection failure around `test_pv_creation`.

## Delivered

- Added `pytest.ini` so pytest collects tests from `tests/` only
- Replaced the stale `tests/test_pv_creation.py` content with a small suite aligned to the current `bin/pv` API
- Fixed direct module loading in the test file by registering the loaded `pv` module in `sys.modules`
- Verified `uv run pytest -q` now completes successfully

## Verification

- `uv run pytest tests/test_pv_creation.py -q`
- `uv run pytest -q`

## Notes

This was a minimal cleanup. The local untracked `bin/test_pv_creation.py` file was not committed or deleted as part of the fix.
