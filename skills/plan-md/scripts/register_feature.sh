#!/usr/bin/env bash
set -euo pipefail

REQUEST=${1:-}
FEATURES_FILE=${2:-features.yaml}

if [[ -z "$REQUEST" ]]; then
  echo "usage: register_feature.sh <request> [features-file]" >&2
  exit 1
fi

EPIC=$(echo "$REQUEST" | tr '[:upper:]' '[:lower:]' | rg -o '^[a-z0-9]+' || true)
if [[ -z "$EPIC" ]]; then
  EPIC="work"
fi

ID=$("$(dirname "$0")/../../_lib/feature_id.sh" "$FEATURES_FILE" "$EPIC")
TODAY=$(date +%F)
DESC=$(echo "$REQUEST" | sed 's/"/\\"/g')

yq -i ". += [{\"id\":\"${ID}\",\"epic\":\"${EPIC}\",\"status\":\"in_progress\",\"title\":\"${DESC}\",\"description\":\"${DESC}\",\"priority\":2,\"depends_on\":[],\"discovered_from\":null,\"spec_file\":\"docs/plans/${ID}.md\",\"created_at\":\"${TODAY}\",\"completed_at\":null}]" "$FEATURES_FILE"

echo "$ID"
