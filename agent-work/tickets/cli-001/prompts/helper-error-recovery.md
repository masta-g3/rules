# Helper Error-Recovery Test

You are testing CLI error recovery for `/Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh`.

Work only inside the current temporary project directory. Do not mutate the repo backlog.

Repo root: `/Users/manager/Code/agents/rules`
Helper path: `/Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh`

CLI-for-agents criteria: errors should fail fast, explain what went wrong, and include a correct next command or enough context for recovery.

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

Intentionally try likely mistakes:

1. `describe tui-002`
2. `update tui-002` without `--json`
3. `update tui-002 --json '{"priority":1}'`
4. `--output id epics`
5. any other realistic mistake you infer from help text

For each:
- command
- stdout/stderr
- exit code
- whether stderr gives the next correct invocation
- candidate minimal fix if recovery is poor

Return concise findings with severity suggestions.
