# Helper Error-Recovery Findings

Fixture created in temp project: `agent-work/features.yaml`. Repo backlog was not touched.

| # | Command | Exit | stdout | stderr | Actionable? | Severity / minimal fix |
|---|---|---:|---|---|---|---|
| 1 | `features_yaml.sh describe tui-002` | 1 | `<empty>` | `unknown command for describe: tui-002` | No. It does not explain that `describe` accepts command names, not feature IDs. | Medium. Add: `describe expects one of: epics, next-id, next, create, update, complete, describe. Example: features_yaml.sh describe update`. |
| 2 | `features_yaml.sh update tui-002` | 2 | `<empty>` | Usage plus `error: the following arguments are required: --json` | Yes. Usage shows required `--json JSON`. | Low. Could improve with example: `features_yaml.sh update tui-002 --json '{"status":"in_progress"}'`. |
| 3 | `features_yaml.sh update tui-002 --json '{"priority":1}'` | 1 | `<empty>` | `unsupported update field(s): priority` | Partly. It says what is wrong, not allowed fields. | Medium. Add allowed fields and example: `update supports only status, plan_file; use create for priority or edit backlog intentionally`. |
| 4 | `features_yaml.sh --output id epics` | 1 | `<empty>` | `--output id is only supported for the next command` | Partly. It identifies invalid mode but not the corrected placement/command. | Low. Add: `Use features_yaml.sh next --output id` or `features_yaml.sh epics --output text|json`. |
| 5 | `features_yaml.sh update tui-002 --json '{"status":"done"}'` | 1 | `<empty>` | `invalid status for update: done. valid values: abandoned, in_progress, pending, superseded. use complete for done` | Mostly. It points to `complete`, but omits required `--plan-file`. | Low/Medium. Add: `features_yaml.sh complete tui-002 --plan-file agent-work/history/tui-002.md`. |
| 6 | `features_yaml.sh complete tui-002` | 2 | `<empty>` | Usage plus `error: the following arguments are required: --plan-file` | Yes. Usage shows the missing required option. | Low. Optional example would improve agent recovery. |

Validation run: executed the six error commands above from `/Users/manager/Code/agents/rules/agent-work/tickets/cli-001/tmp/helper-error-recovery/project`.

Files changed: temp fixture `agent-work/features.yaml`; control-plane result file only.

Blockers/risks: none.
