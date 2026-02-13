#!/usr/bin/env bash
set -euo pipefail

FEATURES_FILE=${1:-features.yaml}
EPIC=${2:-}

if [[ -z "$EPIC" ]]; then
  echo "usage: feature_id.sh [features-file] <epic>" >&2
  exit 1
fi

MAX_ID=$(yq '.[].id' "$FEATURES_FILE" | rg "^${EPIC}-[0-9]+$" | sed "s/^${EPIC}-//" | sort -n | tail -1 || true)
if [[ -z "$MAX_ID" ]]; then
  MAX_ID=0
fi

printf "%s-%03d\n" "$EPIC" "$((10#$MAX_ID + 1))"
