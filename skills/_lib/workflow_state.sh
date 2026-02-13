#!/usr/bin/env bash
set -euo pipefail

NEXT_CMD=${1:-}
STATE_FILE=${2:-.claude/workflow.json}

if [[ -z "$NEXT_CMD" ]]; then
  echo "usage: workflow_state.sh <next-command> [state-file]" >&2
  exit 1
fi

if [[ -f "$STATE_FILE" ]]; then
  jq --arg next "$NEXT_CMD" '.next = $next' "$STATE_FILE" > tmp.$$ && mv -f tmp.$$ "$STATE_FILE"
fi
