Result: helper pipeline works, but `create/update --json` do not support stdin and repeated `update` reports `changed: true` even when it is a no-op.

## Commands / outputs / exit codes

```sh
$ rm -rf agent-work && mkdir -p agent-work/plans && printf '%s\n' \
  '- id: tui-001' '  epic: tui' '  status: done' '  description: Completed prerequisite' \
  '- id: tui-002' '  epic: tui' '  status: pending' '  priority: 1' \
  '  depends_on: [tui-001]' '  description: Improve TUI workflow' > agent-work/features.yaml
exit: 0

$ /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh describe update --output json
stdout: JSON contract lists required `--json` argument of type `json-object`; no stdin/@- option documented.
exit: 0

$ /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh next --epic tui --output id
stdout: tui-002
exit: 0

$ id=$(.../features_yaml.sh next --epic tui --output id); plan="agent-work/plans/$id.md"; printf '# Plan for %s\n' "$id" > "$plan"; .../features_yaml.sh update "$id" --json "{\"status\":\"in_progress\",\"plan_file\":\"$plan\"}" --output json
stdout:
{
  "command": "update",
  "changed": true,
  "dry_run": false,
  "feature": {"id": "tui-002", "priority": 1, "depends_on": ["tui-001"], "description": "Improve TUI workflow", "status": "in_progress", "plan_file": "agent-work/plans/tui-002.md"},
  "updated_fields": ["plan_file", "status"]
}
exit: 0

$ /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh next --epic tui --output id
stdout: tui-002
exit: 0

$ /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh next --epic tui --output json
stdout: recommended=tui-002, suggested_plan_file=agent-work/plans/tui-002.md, in_progress=[tui-002], ready=[]
exit: 0

$ /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh update tui-002 --json '{"status":"in_progress","plan_file":"agent-work/plans/tui-002.md"}' --output json
stdout: changed=true, updated_fields=[plan_file,status]
exit: 0

$ before/after sha256 around repeated same update
stdout: before=3d9cfd3e94b3d099e8f085992c1c86c70a143073833c71ca6e37ef7af10c60f5 after=3d9cfd3e94b3d099e8f085992c1c86c70a143073833c71ca6e37ef7af10c60f5 same=yes
exit: 0

$ printf '%s' '{"plan_file":"agent-work/plans/tui-002.md"}' | /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh update tui-002 --json - --output json
stderr: invalid update payload: Expecting value: line 1 column 1 (char 0)
exit: 1

$ /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh create --json '{"id":"tui-002","status":"pending","description":"Duplicate"}' --output json
stderr: feature already exists in features.yaml: tui-002
exit: 1

$ /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh update tui-002 --json '{"plan_file":"agent-work/plans/tui-002.md"}' --output text
stdout: Updated: tui-002
exit: 0

$ /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh update tui-002 --json '{"plan_file":"agent-work/plans/tui-002.md"}' --output json
stdout: changed=true, updated_fields=[plan_file]
exit: 0
```

## Pipeline / idempotency friction

- Medium: `--json -` does not read stdin; it parses `-` as literal JSON. This forces fragile shell-escaped JSON for natural pipelines.
- Medium: repeated identical `update` is retry-safe in final file state, but reports `changed: true` and lists fields as updated even when the file hash is unchanged. Automation cannot distinguish no-op vs mutation.
- Low: duplicate `create` exits 1 with clear stderr. Good for preventing duplicates, but not idempotent unless callers pre-check or an `--if-missing` mode exists.
- Low: success output is easy to consume when using `next --output id` or `--output json`; default text mutation output (`Updated: tui-002`) is human-friendly but sparse.

## Severity suggestions

1. Add stdin support for JSON payloads (`--json @-` or `--stdin`) — Medium.
2. Make `update` compute no-op diffs and emit `changed:false` when values are unchanged — Medium.
3. Consider non-JSON flags for common update fields (`--status`, `--plan-file`) or documented safe JSON construction examples — Low/Medium.
4. Optionally add `create --if-missing` for retry-safe creation flows — Low.

Files changed: only temporary fixture files under `agent-work/` in the current temp project (`agent-work/features.yaml`, `agent-work/plans/tui-002.md`).

Validation run: fixture creation, `describe`, `next --output id/json`, `update --output json/text`, stdin attempt, repeated update hash comparison, duplicate create test.

Blockers/risks: none for this temp-project test.
