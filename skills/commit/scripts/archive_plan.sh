#!/usr/bin/env bash
set -euo pipefail

PLAN_FILE=${1:-}
if [[ -z "$PLAN_FILE" || ! -f "$PLAN_FILE" ]]; then
  echo "usage: archive_plan.sh <plan-file>" >&2
  exit 1
fi

BASENAME=$(basename "$PLAN_FILE" .md)
TODAY=$(date +%Y%m%d)
mkdir -p docs/history

TARGET="docs/history/${TODAY}_${BASENAME}.md"

cp "$PLAN_FILE" "$TARGET"
echo "$TARGET"
