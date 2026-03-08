#!/usr/bin/env bash
set -euo pipefail

# Parse --id flag (bare ID output for machine consumers)
ID_ONLY=false
MAX_READY_OPTIONS=3
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
EPIC_CONTEXT="all features"
if [[ -n "$EPIC_FILTER" ]]; then
  EPIC_CONTEXT="epic ${EPIC_FILTER}"
fi

IN_PROGRESS_JSON=$(printf '%s\n' "$JSON" | jq -c --arg epic "$EPIC_FILTER" '
  [.[] | select(
    .status == "in_progress" and
    ($epic == "" or (.id | test("^" + $epic + "-")))
  )] |
  sort_by(.priority, .created_at, .id)
')

READY_PENDING_JSON=$(printf '%s\n' "$JSON" | jq -c --arg epic "$EPIC_FILTER" '
  ([.[] | select(.status == "done") | .id]) as $resolved |
  [.[] | select(
    .status == "pending" and
    ($epic == "" or (.id | test("^" + $epic + "-"))) and
    ((.depends_on // []) | all(. as $dep | $resolved | any(. == $dep)))
  )] |
  sort_by(.priority, .created_at, .id)
')

RECOMMENDED_JSON=$(jq -cn \
  --argjson in_progress "$IN_PROGRESS_JSON" \
  --argjson ready "$READY_PENDING_JSON" \
  '$in_progress[0] // $ready[0] // null')

if [[ "$RECOMMENDED_JSON" == "null" ]]; then
  if $ID_ONLY; then
    exit 1
  fi
  PENDING=$(printf '%s\n' "$JSON" | jq --arg epic "$EPIC_FILTER" '
    [.[] | select(
      .status == "pending" and
      ($epic == "" or (.id | test("^" + $epic + "-")))
    )] | length
  ')
  BLOCKED=$(printf '%s\n' "$JSON" | jq --arg epic "$EPIC_FILTER" '
    ([.[] | select(.status == "done") | .id]) as $resolved |
    [.[] | select(
      .status == "pending" and
      ($epic == "" or (.id | test("^" + $epic + "-"))) and
      ((.depends_on // []) | any(. as $dep | $resolved | all(. != $dep)))
    )] | length
  ')
  echo "No ready features in ${EPIC_CONTEXT}. ${PENDING} pending, ${BLOCKED} blocked by unresolved dependencies."
  exit 0
fi

ID=$(printf '%s\n' "$RECOMMENDED_JSON" | jq -r '.id')

if $ID_ONLY; then
  echo "$ID"
  exit 0
fi

echo "IN PROGRESS"
if [[ "$(printf '%s\n' "$IN_PROGRESS_JSON" | jq 'length')" -eq 0 ]]; then
  echo "none"
else
  printf '%s\n' "$IN_PROGRESS_JSON" | jq -r '
    .[] |
    "- \(.id) (priority \((.priority // "-"))): \(.description // .title // "(no description)")"
  '
fi

echo
echo "READY OPTIONS"
if [[ "$(printf '%s\n' "$READY_PENDING_JSON" | jq 'length')" -eq 0 ]]; then
  echo "none"
else
  printf '%s\n' "$READY_PENDING_JSON" | jq -r --argjson max "$MAX_READY_OPTIONS" '
    to_entries |
    .[:$max] |
    .[] |
    "\(.key + 1). \(.value.id) (priority \((.value.priority // "-")), deps: \(((.value.depends_on // []) | if length == 0 then "none" else join(", ") end)))\n   \(.value.description // .value.title // "(no description)")"
  '
fi

echo
echo "RECOMMENDED NEXT"
echo "$ID"
echo "Suggested plan file: docs/plans/${ID}.md"
