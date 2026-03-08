#!/usr/bin/env bash
set -euo pipefail

FEATURE_ID=${1:-}
PLAN_FILE=${2:-}
FEATURES_FILE=${3:-features.yaml}

if [[ -z "$FEATURE_ID" || -z "$PLAN_FILE" ]]; then
  echo "usage: mark_done.sh <feature-id> <plan-file> [features-file]" >&2
  exit 1
fi

if [[ ! -f "$FEATURES_FILE" ]]; then
  echo "features file not found: $FEATURES_FILE" >&2
  exit 1
fi

if ! yq -e ".[] | select(.id == \"${FEATURE_ID}\")" "$FEATURES_FILE" >/dev/null; then
  echo "feature not found in ${FEATURES_FILE}: ${FEATURE_ID}" >&2
  exit 1
fi

TODAY=$(date +%F)
yq -i "(.[] | select(.id == \"${FEATURE_ID}\")) |= (.status = \"done\" | .completed_at = \"${TODAY}\" | .plan_file = \"${PLAN_FILE}\" | del(.spec_file))" "$FEATURES_FILE"
