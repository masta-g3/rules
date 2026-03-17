#!/usr/bin/env bash
set -euo pipefail

MODE=${1:-single}
FEATURE_ARG=${2:-}
EPIC_ARG=${3:-}
FEATURES_FILE=${4:-features.yaml}
WORKFLOW_FILE=${5:-.claude/workflow.json}

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
FEATURES_YAML="${SCRIPT_DIR}/../../_lib/features_yaml.sh"

if [[ "$MODE" == "single" ]]; then
  FEATURE="$FEATURE_ARG"
  if [[ -z "$FEATURE" ]]; then
    FEATURE=$("$FEATURES_YAML" --file "$FEATURES_FILE" --output id next) || {
      echo "AUTOPILOT EXCEPTION: no_ready_features" >&2; exit 2
    }
  fi
  jq -n --arg mode "single" --arg feature "$FEATURE" --arg next "/prime" \
    '{mode:$mode, feature:$feature, next:$next}' > "$WORKFLOW_FILE"
  echo "$FEATURE"
  exit 0
fi

EPIC="$EPIC_ARG"
if [[ -z "$EPIC" ]]; then
  FIRST=$("$FEATURES_YAML" --file "$FEATURES_FILE" --output id next) || {
    echo "AUTOPILOT EXCEPTION: no_ready_features" >&2; exit 2
  }
  EPIC=$(echo "$FIRST" | sed 's/-[0-9]*$//')
fi

FEATURE=$("$FEATURES_YAML" --file "$FEATURES_FILE" --output id next --epic "$EPIC") || {
  echo "AUTOPILOT EXCEPTION: no_ready_features in epic ${EPIC}" >&2; exit 2
}

jq -n --arg mode "continuous" --arg epic "$EPIC" --arg feature "$FEATURE" --arg next "/prime" \
  '{mode:$mode, epic:$epic, feature:$feature, next:$next}' > "$WORKFLOW_FILE"
echo "$FEATURE"
