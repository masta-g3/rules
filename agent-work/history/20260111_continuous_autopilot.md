# Continuous Autopilot: Epic-Scoped Feature Cycling

Extends autopilot to complete all features in an epic before stopping.

## Summary

- [x] Added `--epic` flag to `/autopilot` command
- [x] Extended workflow.json schema with `mode` and `epic` fields
- [x] Added loop-back logic in commit.md for continuous mode
- [x] Backward compatible: existing workflows default to single mode
- [x] Updated README.md with continuous mode examples

## Usage

```
/autopilot              → single feature (existing behavior)
/autopilot feature-id   → specific feature (existing behavior)
/autopilot --epic       → all ready features in auto-detected epic
/autopilot --epic auth  → all ready features in auth-* epic
```

## workflow.json Schema

```json
{
  "mode": "single|continuous",
  "epic": "auth",
  "feature": "auth-001",
  "next": "/prime"
}
```

## Files Changed

| File | Change |
|------|--------|
| `commands/autopilot.md` | --epic flag, mode/epic in workflow.json |
| `commands/commit.md` | Mode check, loop-back for continuous |
| `README.md` | Continuous mode documentation |
