---
name: review
description: Review finished work before archival and commit.
---

Set `$SKILLS_ROOT` to your harness skills path before helper commands: `~/.codex/skills` (Codex), `~/.claude/skills` (Claude), `~/.cursor/skills` (Cursor), `~/.pi/agent/skills` (Pi).

Review the active task after implementation and before `/commit`.

### Review Scope

Inspect the explicit pre-finalization implementation file set for the task.

Build that file list deliberately from the active plan and the files you changed during implementation. Treat that session file list as authoritative; use the current diff only as a sanity check for missed task files. Include files that were intentionally edited as part of the task. Exclude commit-owned follow-up changes such as plan archival in `docs/history/`, `features.yaml` completion, and repo-doc sync done during `/commit`.

### Review Process

1. Read the final implementation files for the task.
2. Check that the change is as narrow as possible while still solving the task.
3. Flag avoidable duplication, unnecessary abstractions, pattern drift, or edits that widen the impact surface without clear need.
4. Check for obvious residue:
   - debug prints
   - commented-out code
   - TODO/FIXME markers tied to the completed work
   - style drift or visible prompt-generated bloat
5. For non-trivial changes, invoke the `code-critic` reviewer subagent and pass the exact file list you assembled. Skip for trivial edits.
6. Treat `code-critic` output as advisory: address valid issues, but ignore suggestions that depend on missing context, widen scope, or conflict with the approved task.

### Boundaries

This is a readiness check, not finalization.

Do not:
- archive plans
- mutate `features.yaml`
- create a commit
- widen scope beyond the active task

### Autopilot

If `.claude/workflow.json` exists and the review is ready to land, advance the workflow with:

```bash
$SKILLS_ROOT/_lib/workflow_state.sh /commit
```

If review finds blocking issues and `.claude/workflow.json` exists, abort the autopilot run:

```bash
rm -f .claude/workflow.json
```

### Output

Report one of:

- `READY FOR COMMIT` — include any brief caveats worth remembering
- `REVIEW ISSUES` — list the blocking issues and the concrete fixes needed
