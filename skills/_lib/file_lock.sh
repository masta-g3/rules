#!/usr/bin/env bash
set -euo pipefail

LOCK_FILE=${LOCK_FILE:-docs/plans/.file-locks.json}
ACTION=${1:-}
FILE=${2:-}
FEATURE_ID=${3:-}

if [[ ! -f "$LOCK_FILE" ]]; then
  exit 0
fi

case "$ACTION" in
  check)
    HOLDER=$(jq -r --arg f "$FILE" --arg me "$FEATURE_ID" '.[$f] // null | if . != null and .by != $me then .by else empty end' "$LOCK_FILE")
    if [[ -n "$HOLDER" ]]; then
      echo "$HOLDER"
      exit 2
    fi
    ;;
  reserve)
    jq --arg f "$FILE" --arg id "$FEATURE_ID" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '.[$f] = {"by": $id, "at": $ts}' "$LOCK_FILE" > tmp.$$ && mv -f tmp.$$ "$LOCK_FILE"
    ;;
  release)
    jq --arg f "$FILE" 'del(.[$f])' "$LOCK_FILE" > tmp.$$ && mv -f tmp.$$ "$LOCK_FILE"
    ;;
  release-all)
    jq --arg id "$FEATURE_ID" 'with_entries(select(.value.by != $id))' "$LOCK_FILE" > tmp.$$ && mv -f tmp.$$ "$LOCK_FILE"
    if [[ "$(jq -r 'keys | length' "$LOCK_FILE")" == "0" ]]; then
      rm -f "$LOCK_FILE"
    fi
    ;;
  *)
    echo "usage: file_lock.sh <check|reserve|release|release-all> <file?> <feature-id?>" >&2
    exit 1
    ;;
esac
