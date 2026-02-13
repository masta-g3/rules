#!/usr/bin/env bash
set -euo pipefail

MODE=${1:-single}
FEATURE_ARG=${2:-}
EPIC_ARG=${3:-}
FEATURES_FILE=${4:-features.yaml}
WORKFLOW_FILE=${5:-.claude/workflow.json}

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
SELECT_NEXT="${SCRIPT_DIR}/../../_lib/select_next_feature.sh"

if [[ "$MODE" == "single" ]]; then
  FEATURE="$FEATURE_ARG"
  if [[ -z "$FEATURE" ]]; then
    FEATURE=$("$SELECT_NEXT" "$FEATURES_FILE")
  fi
  if [[ -z "$FEATURE" ]]; then
    echo "AUTOPILOT EXCEPTION: no_ready_features" >&2
    exit 2
  fi
  jq -n --arg mode "single" --arg feature "$FEATURE" --arg next "/prime" '{mode:$mode, feature:$feature, next:$next}' > "$WORKFLOW_FILE"
  echo "$FEATURE"
  exit 0
fi

EPIC="$EPIC_ARG"
if [[ -z "$EPIC" ]]; then
  FIRST=$("$SELECT_NEXT" "$FEATURES_FILE")
  if [[ -z "$FIRST" ]]; then
    echo "AUTOPILOT EXCEPTION: no_ready_features" >&2
    exit 2
  fi
  EPIC=$(echo "$FIRST" | sed 's/-[0-9][0-9][0-9]$//')
fi

FEATURE=$("$SELECT_NEXT" "$FEATURES_FILE" "$EPIC")
if [[ -z "$FEATURE" ]]; then
  echo "AUTOPILOT EXCEPTION: no_ready_features in epic ${EPIC}" >&2
  exit 2
fi

jq -n --arg mode "continuous" --arg epic "$EPIC" --arg feature "$FEATURE" --arg next "/prime" '{mode:$mode, epic:$epic, feature:$feature, next:$next}' > "$WORKFLOW_FILE"
echo "$FEATURE"
