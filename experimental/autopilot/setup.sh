#!/bin/bash
set -e

TARGET="${1:-.}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

[[ ! -d "$TARGET" ]] && { echo "Error: $TARGET is not a directory"; exit 1; }

mkdir -p "$TARGET/.claude/scripts"

cp "$SCRIPT_DIR/scripts/workflow_hook.sh" "$TARGET/.claude/scripts/workflow.sh"

TARGET_SETTINGS="$TARGET/.claude/settings.json"
SETTINGS_TEMPLATE="$SCRIPT_DIR/.claude/settings.json"
if [[ -f "$TARGET_SETTINGS" ]]; then
  jq -s '.[0] * {hooks: (.[0].hooks // {}) * .[1].hooks}' \
    "$TARGET_SETTINGS" "$SETTINGS_TEMPLATE" > tmp.$$ && mv tmp.$$ "$TARGET_SETTINGS"
else
  cp "$SETTINGS_TEMPLATE" "$TARGET_SETTINGS"
fi

GITIGNORE="$TARGET/.gitignore"
if [[ -f "$GITIGNORE" ]]; then
  grep -qxF '.claude/workflow.json' "$GITIGNORE" || echo '.claude/workflow.json' >> "$GITIGNORE"
else
  echo '.claude/workflow.json' > "$GITIGNORE"
fi

echo "Autopilot configured in $TARGET"
