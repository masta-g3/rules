# Deterministic Baseline

Date: 2026-05-22T06:25:50Z
Repo: /Users/manager/Code/agents/rules
Fixture: /Users/manager/Code/agents/rules/agent-work/tickets/cli-001/tmp/baseline/project/agent-work/features.yaml

## Help captures
```bash
$ /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh $ --help 
```

```text
[stdout]
usage: features_yaml.py [-h] [--file GLOBAL_FILE] [--output {text,json,id}]
                        {epics,next-id,next,create,update,complete,describe}
                        ...

Repo-local helper for deterministic agent-work/features.yaml operations.

positional arguments:
  {epics,next-id,next,create,update,complete,describe}

options:
  -h, --help            show this help message and exit
  --file GLOBAL_FILE
  --output {text,json,id}
[exit_code] 0
```

```bash
$ /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh $ next $ --help 
```

```text
[stdout]
usage: features_yaml.py next [-h] [--file FILE] [--epic EPIC]
                             [--output {text,json,id}]

options:
  -h, --help            show this help message and exit
  --file FILE
  --epic EPIC
  --output {text,json,id}
[exit_code] 0
```

```bash
$ /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh $ update $ --help 
```

```text
[stdout]
usage: features_yaml.py update [-h] [--file FILE] [--output {text,json}]
                               [--dry-run] --json JSON
                               feature_id

positional arguments:
  feature_id

options:
  -h, --help            show this help message and exit
  --file FILE
  --output {text,json}
  --dry-run
  --json JSON
[exit_code] 0
```

```bash
$ /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh $ describe $ --help 
```

```text
[stdout]
usage: features_yaml.py describe [-h] [--output {text,json}]
                                 [describe_command]

positional arguments:
  describe_command

options:
  -h, --help            show this help message and exit
  --output {text,json}
[exit_code] 0
```

```bash
$ /Users/manager/Code/agents/rules/bin/pv $ --help 
```

```text
[stdout]

pv - Portfolio & Feature Viewer

Unified TUI for agent-work/features.yaml tracking.
Navigate: Portfolio → Project → Epic → Feature

Usage:
    pv                    # Scan ~/Code, portfolio view
    pv /path              # Scan specific directory
    pv agent-work/features.yaml  # Project view for specific file
    fv                    # Alias: project view for ./agent-work/features.yaml

Navigation:
    j/k or ↑/↓  Move selection
    Enter       Drill down (project/epic/feature)
    b/Esc       Go back
    s           Cycle sort mode (portfolio)
    f           Cycle filter (open/all/active/stalled/archived)
    h/?         Show help
    q           Quit

[exit_code] 0
```

```bash
$ /Users/manager/Code/agents/rules/bin/fv $ --help 
```

```text
[stdout]

pv - Portfolio & Feature Viewer

Unified TUI for agent-work/features.yaml tracking.
Navigate: Portfolio → Project → Epic → Feature

Usage:
    pv                    # Scan ~/Code, portfolio view
    pv /path              # Scan specific directory
    pv agent-work/features.yaml  # Project view for specific file
    fv                    # Alias: project view for ./agent-work/features.yaml

Navigation:
    j/k or ↑/↓  Move selection
    Enter       Drill down (project/epic/feature)
    b/Esc       Go back
    s           Cycle sort mode (portfolio)
    f           Cycle filter (open/all/active/stalled/archived)
    h/?         Show help
    q           Quit

[exit_code] 0
```

## Success workflows
```bash
$ /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh $ --file $ agent-work/features.yaml $ next $ --output $ id 
```

```text
[stdout]
tui-002
[exit_code] 0
```

```bash
$ /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh $ --file $ agent-work/features.yaml $ update $ tui-002 $ --json $ \{\"plan_file\":\"agent-work/plans/tui-002.md\"\} $ --output $ json 
```

```text
[stdout]
{
  "command": "update",
  "changed": true,
  "dry_run": false,
  "feature": {
    "id": "tui-002",
    "priority": 1,
    "depends_on": [
      "tui-001"
    ],
    "description": "Improve TUI workflow",
    "status": "pending",
    "plan_file": "agent-work/plans/tui-002.md"
  },
  "updated_fields": [
    "plan_file"
  ]
}
[exit_code] 0
```

```bash
$ /Users/manager/Code/agents/rules/bin/fv 
```

```text
[stdout]
┌── project ───────────────────────────────────────────────────────────────────┐
│                                                                              │
│  PROGRESS ════════════════════════════════════════════════════════════════   │
│                                                                              │
│  █████████████████████████░░░░░░░░░░░░░░░░░░░░░░░░░  1/2  50.0%              │
│  ✓ 1 done   ○ 1 pending                                                      │
│                                                                              │
│  EPICS ═══════════════════════════════════════════════════════════════════   │
│                                                                              │
│ ▸tui           ████████░░░░░░░░    1/2  50%  ○ 1 pending                     │
│                                                                              │
│  RECENT ══════════════════════════════════════════════════════════════════   │
│                                                                              │
│                                                                              │
│  NEXT UP ═════════════════════════════════════════════════════════════════   │
│                                                                              │
│  ○ tui-002             Improve TUI workflow                                  │
│                                                                              │
└────────────────────────────── [n]ew epic [r]efresh [Esc]back [h]elp [q]uit ──┘
[exit_code] 0
```

## Mistake workflows
```bash
$ /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh $ describe $ tui-002 
```

```text
[stderr]
unknown command for describe: tui-002
[exit_code] 1
```

```bash
$ /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh $ update $ tui-002 
```

```text
[stderr]
usage: features_yaml.py update [-h] [--file FILE] [--output {text,json}]
                               [--dry-run] --json JSON
                               feature_id
features_yaml.py update: error: the following arguments are required: --json
[exit_code] 2
```

```bash
$ /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh $ --output $ id $ epics 
```

```text
[stderr]
--output id is only supported for the next command
[exit_code] 1
```

