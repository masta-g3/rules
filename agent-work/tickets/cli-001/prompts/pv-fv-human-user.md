# pv/fv Human-Like Terminal User Test

You are a developer trying to inspect project features with the TUI CLIs in `/Users/manager/Code/agents/rules`.

Work only inside the current temporary project directory. Do not mutate the repo backlog.

Repo root: `/Users/manager/Code/agents/rules`
PV path: `/Users/manager/Code/agents/rules/bin/pv`
FV path: `/Users/manager/Code/agents/rules/bin/fv`
Helper path for comparison: `/Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh`

CLI-for-agents criteria: layered help with examples, clear non-interactive behavior, actionable errors, clear distinction between human TUI and agent automation paths.

Create this fixture in the current directory:

```yaml
# agent-work/features.yaml
- id: tui-001
  epic: tui
  status: done
  description: Completed prerequisite
- id: tui-002
  epic: tui
  status: pending
  priority: 1
  depends_on: [tui-001]
  description: Improve TUI workflow
```

Mission:

1. Run `pv --help` and `fv --help`.
2. Run `fv` from this temp project in non-TTY mode (`< /dev/null`) and inspect the output.
3. Run `pv agent-work/features.yaml < /dev/null` and `pv . < /dev/null`.
4. Try an invalid path and judge whether the error is actionable.
5. Identify whether help makes it clear how humans should edit and whether agents should instead use `features_yaml.sh`.

Capture commands, outputs, exit codes, friction points, and severity suggestions.
