# Autopilot Workflow System Fixes

Hardened the Claude Code hook-based autopilot system.

## Changes

- Workflow.sh: Added command validation (whitelist: /prime, /plan-md, /execute, /commit)
- Workflow.sh: Added feature ID validation for commands that require it
- Settings.json: Increased hook timeout 5s → 15s
- AGENTS.md: Added instruction for Claude to execute AUTOPILOT hook commands
- Commands: Set `disable-model-invocation: false` on autopilot chain commands
- Project-init.md: Simplified - removed inline script scaffolding
- Setup-autopilot.sh: New script to configure autopilot in target repos

## Architecture

```
/autopilot <feature>
    ↓
workflow.json: {feature, next: "/prime"}
    ↓
Stop Hook → workflow.sh → {"decision":"block","reason":"AUTOPILOT: Run /prime"}
    ↓
Claude executes /prime → advances .next → cycle repeats
    ↓
/prime → /plan-md → /execute → /commit → cleanup
```
