# Helper Pipeline Automation Test

You are automating feature selection and plan attachment in shell using `/Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh`.

Work only inside the current temporary project directory. Do not mutate the repo backlog.

Repo root: `/Users/manager/Code/agents/rules`
Helper path: `/Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh`

CLI-for-agents criteria: commands should be non-interactive, composable in pipelines, machine-readable where requested, retry-safe/idempotent where practical, and not rely on fragile shell quoting if stdin would be natural.

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

1. Build a small shell automation flow that selects the next feature ID and attaches `agent-work/plans/<id>.md`.
2. Try to pass JSON via stdin if the CLI appears to support it, or note that it does not.
3. Repeat safe commands to evaluate retry/idempotency behavior for `update`; optionally test `create` duplicate behavior in this temp fixture.
4. Evaluate whether success output is easy to consume from shell.

Capture commands, outputs, exit codes, friction points, and severity suggestions.
