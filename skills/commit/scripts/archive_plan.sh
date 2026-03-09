#!/usr/bin/env bash
set -euo pipefail

PLAN_FILE=${1:-}
SHORT_DESC=${2:-}

if [[ -z "$PLAN_FILE" || -z "$SHORT_DESC" || ! -f "$PLAN_FILE" ]]; then
  echo "usage: archive_plan.sh <plan-file> <short-desc>" >&2
  exit 1
fi

BASENAME=$(basename "$PLAN_FILE" .md)
TODAY=$(date +%Y%m%d)
mkdir -p docs/history

TARGET="docs/history/${TODAY}_${BASENAME}_${SHORT_DESC}.md"

if [[ -e "$TARGET" ]]; then
  echo "archive target already exists: $TARGET" >&2
  exit 1
fi

mv "$PLAN_FILE" "$TARGET"
echo "$TARGET"
