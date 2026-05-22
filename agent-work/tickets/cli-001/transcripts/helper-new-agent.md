Result: completed the helper new-agent discoverability test without reading `skills/_lib/features_yaml.py`.

Files changed:
- Temp fixture only: `agent-work/features.yaml`
- Temp plan file: `agent-work/plans/tui-002.md`
- No repo backlog changes.

Transcript / important commands:

1. Created fixture
```sh
mkdir -p agent-work && cat > agent-work/features.yaml <<'YAML'
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
YAML
```
Exit: 0

2. Top-level help
```sh
bash /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh --help
```
Output showed commands: `epics,next-id,next,create,update,complete,describe`; options included `--file` and `--output {text,json,id}`.
Exit: 0

3. Discover/select next feature as ID
```sh
bash /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh next --help
bash /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh next --output id
```
Output:
```text
tui-002
```
Exit: 0

4. Discover update syntax and dry-run plan attachment
```sh
bash /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh update --help
mkdir -p agent-work/plans
printf '# Plan for tui-002\n' > agent-work/plans/tui-002.md
bash /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh update tui-002 --json '{"plan_file":"agent-work/plans/tui-002.md"}' --dry-run --output json
```
Dry-run output included:
```json
{
  "command": "update",
  "changed": false,
  "dry_run": true,
  "feature": {"id": "tui-002", "status": "pending", "plan_file": "agent-work/plans/tui-002.md"},
  "updated_fields": ["plan_file"]
}
```
Exit: 0

5. Apply plan attachment
```sh
bash /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh update tui-002 --json '{"plan_file":"agent-work/plans/tui-002.md"}' --output json
```
Output included `"changed": true`, `"dry_run": false`, and `"plan_file": "agent-work/plans/tui-002.md"`.
Exit: 0

6. Verify via CLI
```sh
bash /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh next --output json
```
Output included:
```json
{
  "recommended": "tui-002",
  "suggested_plan_file": "agent-work/plans/tui-002.md",
  "ready": [{"id": "tui-002", "status": "pending", "plan_file": "agent-work/plans/tui-002.md"}],
  "missing_file": false
}
```
Exit: 0

7. Direct YAML verification
```sh
python3 - <<'PY'
from pathlib import Path
print(Path('agent-work/features.yaml').read_text(), end='')
PY
```
Output confirmed persisted state:
```yaml
- id: tui-001
  epic: tui
  status: done
  description: Completed prerequisite
- id: tui-002
  epic: tui
  status: pending
  priority: 1
  depends_on:
  - tui-001
  description: Improve TUI workflow
  plan_file: agent-work/plans/tui-002.md
```
Exit: 0

Why direct YAML was inspected: I could verify `recommended`, `ready`, and `plan_file` through `next --output json`, but there is no direct `get/show feature by ID` command. Also, CLI JSON omitted `epic`, so direct YAML was needed to verify the complete persisted feature state.

Additional probes:
```sh
bash /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh describe update --output json
```
Exit: 0. Helpful contract says update supports `status` and `plan_file`, but still gives no copy-paste example.

```sh
bash /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh update tui-002 --plan-file agent-work/plans/tui-002.md --dry-run
```
Output: required `--json` error, not a plan-file-specific hint. Exit: 2.

```sh
printf '{"plan_file":"agent-work/plans/tui-002.md"}' | bash /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh update tui-002 --json - --dry-run --output json
```
Output: `invalid update payload: Expecting value: line 1 column 1 (char 0)`. Exit: 1.

```sh
bash /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh update tui-002 --json '{"plan_file":"agent-work/plans/tui-002.md"}' --output json
```
Repeated update still returned `"changed": true`. Exit: 0.

Findings / severity suggestions:
- Medium: no direct feature lookup/show command; verification requires `next --output json` plus direct YAML for full state.
- Medium: repeated identical `update` reports `changed: true`, weakening idempotency/retry-safety signals.
- Medium: no stdin support for `--json -`, despite pipeline-friendly CLI criteria.
- Low/Medium: `update --help` does not state allowed JSON keys or include copy-paste examples; `describe update` helps but is less discoverable.
- Low: intuitive `update --plan-file ...` fails with only “--json required”; a targeted hint would be more actionable.

Validation run: helper commands above; final state verified in CLI output and YAML.
