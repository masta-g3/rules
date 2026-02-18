#!/usr/bin/env bash
set -euo pipefail

# Parse --id flag (bare ID output for machine consumers)
ID_ONLY=false
if [[ "${1:-}" == "--id" ]]; then
  ID_ONLY=true
  shift
fi

FEATURES_FILE=${1:-features.yaml}
EPIC_FILTER=${2:-}

if [[ ! -f "$FEATURES_FILE" ]]; then
  if $ID_ONLY; then
    exit 1
  fi
  echo "No features.yaml found. Create one with /ticket-init or /epic-init."
  exit 0
fi

JSON=$(yq -o=json "$FEATURES_FILE")

epic_test=""
[[ -n "$EPIC_FILTER" ]] && epic_test="and (.id | test(\"^${EPIC_FILTER}-\"))"

# 1) First try: in_progress feature (resume active work)
RESULT=$(echo "$JSON" | jq -r "
  [.[] | select(.status == \"in_progress\" $epic_test)] |
  sort_by(.priority, .created_at, .id) | .[0] // null
")

# 2) Fallback: first unblocked pending feature
if [[ "$RESULT" == "null" ]]; then
  RESULT=$(echo "$JSON" | jq -r "
    ([.[] | select(.status == \"done\" or .status == \"in_progress\") | .id]) as \$resolved |
    [.[] | select(
      .status == \"pending\" $epic_test and
      ((.depends_on // []) | all(. as \$dep | \$resolved | any(. == \$dep)))
    )] |
    sort_by(.priority, .created_at, .id) | .[0] // null
  ")
fi

if [[ "$RESULT" == "null" ]]; then
  if $ID_ONLY; then
    exit 1
  fi
  PENDING=$(echo "$JSON" | jq '[.[] | select(.status == "pending")] | length')
  BLOCKED=$(echo "$JSON" | jq "
    ([.[] | select(.status == \"done\" or .status == \"in_progress\") | .id]) as \$resolved |
    [.[] | select(
      .status == \"pending\" and
      ((.depends_on // []) | any(. as \$dep | \$resolved | all(. != \$dep)))
    )] | length
  ")
  echo "No ready features. ${PENDING} pending, ${BLOCKED} blocked by unresolved dependencies."
  exit 0
fi

ID=$(echo "$RESULT" | jq -r '.id')

if $ID_ONLY; then
  echo "$ID"
  exit 0
fi

DESC=$(echo "$RESULT" | jq -r '.description')
PRIO=$(echo "$RESULT" | jq -r '.priority')
STATUS=$(echo "$RESULT" | jq -r '.status')
DEPS=$(echo "$RESULT" | jq -r '(.depends_on // []) | if length == 0 then "none" else join(", ") end')

echo "NEXT FEATURE: ${ID} (${STATUS})"
echo "Description: ${DESC}"
echo "Priority: ${PRIO}"
echo "Dependencies: ${DEPS}"
echo "Suggested plan file: ${ID}.md"
