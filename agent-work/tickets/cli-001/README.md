# cli-001 Assessment Workspace

This directory contains ticket-local artifacts for assessing CLI usability issues in:

- `skills/_lib/features_yaml.sh`
- `bin/pv` / `bin/fv`

The assessment uses deterministic baseline commands plus targeted subagent user-like tests. Temporary fixture projects live under `tmp/` and are safe to remove after review.

## Entry points

```bash
repo=/Users/manager/Code/agents/rules
$repo/skills/_lib/features_yaml.sh
$repo/bin/pv
$repo/bin/fv
```

## CLI-for-agents criteria

Assess against: non-interactive flags, layered help, copy-pasteable examples, stdin/pipelines, fast actionable errors, idempotency/retry safety, dry-run, confirmation bypass where needed, consistent structure, and machine-useful success output.
