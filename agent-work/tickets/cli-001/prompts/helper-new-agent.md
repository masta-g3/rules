# Helper New-Agent Discoverability Test

You are a coding agent evaluating CLI usability in `/Users/manager/Code/agents/rules`.

Work only inside the current temporary project directory. Do not mutate the repo backlog.

Repo root: `/Users/manager/Code/agents/rules`
Helper path: `/Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh`

CLI-for-agents criteria: non-interactive flags, layered help, copy-pasteable examples, stdin/pipelines, fast actionable errors, idempotency/retry safety, dry-run, consistent structure, and machine-useful success output.

Mission: without reading `skills/_lib/features_yaml.py` first, use CLI help and command output to discover how to:

1. Select the next feature as an ID.
2. Attach a plan file to `tui-002`.
3. Verify the resulting feature state.

Start by creating this fixture in the current directory:

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

Rules:
- Capture each command you ran.
- Capture stdout/stderr and exit code for important commands.
- Record confusion points and whether help/error text was enough.
- If you inspect YAML directly, say why the CLI did not satisfy verification.
- Return a concise transcript with findings and severity suggestions.
