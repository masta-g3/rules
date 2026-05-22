Result: pv/fv are usable as human TUIs and safely exit in non-TTY mode, but help does not document non-interactive behavior or tell agents to use `features_yaml.sh`; invalid-path errors are terse.

## Fixture
Created only in temp project:

```sh
mkdir -p agent-work
cat > agent-work/features.yaml <<'YAML'
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

## Transcript

### `pv --help`
```text
$ /Users/manager/Code/agents/rules/bin/pv --help
pv - Portfolio & Feature Viewer
...
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
[exit 0]
```

### `fv --help`
Same help text as `pv --help`.
```text
[exit 0]
```

### `fv < /dev/null`
```text
$ /Users/manager/Code/agents/rules/bin/fv < /dev/null
┌── project ...
│  PROGRESS ...
│  1/2  50.0%
│  ✓ 1 done   ○ 1 pending
│  EPICS ...
│ ▸tui ... 1/2 50% ○ 1 pending
│  NEXT UP ...
│  ○ tui-002  Improve TUI workflow
└── [n]ew epic [r]efresh [Esc]back [h]elp [q]uit ──┘
[exit 0]
```

### `pv agent-work/features.yaml < /dev/null`
Same project snapshot as `fv < /dev/null`.
```text
[exit 0]
```

### `pv . < /dev/null`
```text
$ /Users/manager/Code/agents/rules/bin/pv . < /dev/null
┌── pv ...
│  PORTFOLIO
│  1 projects   2 features   1 done (50%)
│  PROJECTS
│ ▸project ... 1/2 50% ○ 1 pending ◆ May 21
│  up next: tui-002 ○ Improve TUI workflow
└── [s]ort:modified [f]ilter:all [a]ctivity [t]ree [h]elp [q]uit ──┘
[exit 0]
```

### Invalid path
```text
$ /Users/manager/Code/agents/rules/bin/pv does-not-exist < /dev/null
Error: does-not-exist not found
[exit 1]

$ /Users/manager/Code/agents/rules/bin/fv does-not-exist < /dev/null
Error: does-not-exist not found
[exit 1]
```

### Helper comparison
```text
$ /Users/manager/Code/agents/rules/skills/_lib/features_yaml.sh --help
usage: features_yaml.py [-h] [--file GLOBAL_FILE] [--output {text,json,id}]
                        {epics,next-id,next,create,update,complete,describe}
                        ...
Repo-local helper for deterministic agent-work/features.yaml operations.
[exit 0]
```

## Findings and severity suggestions

- P2: `pv`/`fv` help does not distinguish human TUI usage from agent automation. Add: humans use `pv`/`fv`; agents/scripts should use `skills/_lib/features_yaml.sh` for deterministic YAML operations.
- P2: non-TTY mode exits cleanly with code 0, but emits a decorative TUI snapshot, not documented machine-readable output. Document this explicitly or add/direct agents to JSON/text helper output.
- P3: help is one-layer only and has inline usage examples, but no task examples like “view current project”, “scan repo”, “edit via TUI”, or “script-safe helper commands”.
- P3: invalid-path error is not actionable. Prefer including cwd plus expected file/dir examples, e.g. `pv .`, `pv agent-work/features.yaml`, `fv`, and mention helper for agents.

Files changed: temp fixture `agent-work/features.yaml`; control-plane result file only.
Validation run: commands above.