#!/usr/bin/env bash
set -euo pipefail

FEATURES_FILE=${1:-features.yaml}
EPIC_FILTER=${2:-}

JQ_FILTER='([.[] | select(.status == "done") | .id]) as $done |
  [.[] | select(
    .status == "pending" and
    ((.depends_on // []) | all(. as $dep | $done | any(. == $dep)))
  )]'

if [[ -n "$EPIC_FILTER" ]]; then
  JQ_FILTER="([.[] | select(.status == \"done\") | .id]) as \$done |
    [.[] | select(
      .status == \"pending\" and
      (.id | test(\"^${EPIC_FILTER}-\")) and
      ((.depends_on // []) | all(. as \$dep | \$done | any(. == \$dep)))
    )]"
fi

yq -o=json "$FEATURES_FILE" | jq -r "${JQ_FILTER} | unique_by(.id) | sort_by(.priority, .created_at, .id) | .[0].id // \"\""
