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
yq -i "(.[] | select(.id == \"${FEATURE_ID}\")) |= (.status = \"done\" | .completed_at = \"${TODAY}\" | .spec_file = \"${SPEC_FILE}\")" "$FEATURES_FILE"
