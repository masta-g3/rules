#!/bin/bash
STATE=".claude/workflow.json"

[[ ! -f "$STATE" ]] && exit 0

NEXT=$(jq -r '.next // empty' "$STATE")
FEATURE=$(jq -r '.feature // empty' "$STATE")

[[ -z "$NEXT" ]] && exit 0

if [[ "$NEXT" == "/prime" || "$NEXT" == "/plan-md" ]]; then
  CMD="$NEXT $FEATURE"
else
  CMD="$NEXT"
fi

cat << EOF
{
  "decision": "block",
  "reason": "AUTOPILOT: Run $CMD"
}
EOF
