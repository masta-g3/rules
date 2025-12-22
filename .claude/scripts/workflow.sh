#!/bin/bash
STATE=".claude/workflow.json"

[[ ! -f "$STATE" ]] && exit 0

NEXT=$(jq -r '.next // empty' "$STATE")
FEATURE=$(jq -r '.feature // empty' "$STATE")

[[ -z "$NEXT" ]] && exit 0

# Validate known commands
case "$NEXT" in
  /prime|/plan-md)
    [[ -z "$FEATURE" ]] && { echo '{"decision":"block","reason":"AUTOPILOT ERROR: '"$NEXT"' requires feature ID"}'; exit 0; }
    CMD="$NEXT $FEATURE" ;;
  /execute|/commit)
    CMD="$NEXT" ;;
  *)
    echo '{"decision":"block","reason":"AUTOPILOT ERROR: Unknown command '"$NEXT"'"}'; exit 0 ;;
esac

echo '{"decision":"block","reason":"AUTOPILOT: Run '"$CMD"'"}'
