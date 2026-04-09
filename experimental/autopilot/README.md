# Experimental Autopilot

Claude Code-only autopilot flow for running `prime -> plan-md -> execute -> review -> commit` through a hook-driven state file.

This flow is experimental:
- it is not part of the default workflow
- it is not included in `AGENTS.md`
- it is not synced by `sync-prompts.sh`

Contents:
- `SKILL.md`: autopilot command prompt
- `WORKFLOW.md`: state transition reference for the flow
- `setup.sh`: installs the project hook payload into a target repo
- `scripts/start_workflow.sh`: initializes `.claude/workflow.json`
- `scripts/workflow_hook.sh`: Stop-hook dispatcher for the next command
- `lib/workflow_state.sh`: helper to advance workflow state
- `.claude/settings.json`: hook template installed by `setup.sh`

Setup:
```bash
./experimental/autopilot/setup.sh /path/to/project
```

Runtime state stays in the target repo at `.claude/workflow.json`.
