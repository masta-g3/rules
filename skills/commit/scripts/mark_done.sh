#!/usr/bin/env bash
set -euo pipefail

FEATURE_ID=${1:-}
SPEC_FILE=${2:-}
FEATURES_FILE=${3:-features.yaml}

if [[ -z "$FEATURE_ID" || -z "$SPEC_FILE" ]]; then
  echo "usage: mark_done.sh <feature-id> <spec-file> [features-file]" >&2
  exit 1
fi

TODAY=$(date +%F)
yq -i "(.[] | select(.id == \"${FEATURE_ID}\") | .status) = \"done\"" "$FEATURES_FILE"
yq -i "(.[] | select(.id == \"${FEATURE_ID}\") | .completed_at) = \"${TODAY}\"" "$FEATURES_FILE"
yq -i "(.[] | select(.id == \"${FEATURE_ID}\") | .spec_file) = \"${SPEC_FILE}\"" "$FEATURES_FILE"
