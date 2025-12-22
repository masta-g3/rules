#!/bin/bash
# Setup autopilot workflow in target repo
set -e

TARGET="${1:-.}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

[[ ! -d "$TARGET" ]] && { echo "Error: $TARGET is not a directory"; exit 1; }

# Create directories
mkdir -p "$TARGET/.claude/scripts"

# Copy workflow script
cp "$SCRIPT_DIR/.claude/scripts/workflow.sh" "$TARGET/.claude/scripts/workflow.sh"

# Merge or create settings.json
TARGET_SETTINGS="$TARGET/.claude/settings.json"
if [[ -f "$TARGET_SETTINGS" ]]; then
  # Merge hooks into existing settings
  jq -s '.[0] * {hooks: (.[0].hooks // {}) * .[1].hooks}' \
    "$TARGET_SETTINGS" "$SCRIPT_DIR/.claude/settings.json" > tmp.$$ && mv tmp.$$ "$TARGET_SETTINGS"
else
  cp "$SCRIPT_DIR/.claude/settings.json" "$TARGET_SETTINGS"
fi

# Add workflow.json to gitignore
GITIGNORE="$TARGET/.gitignore"
if [[ -f "$GITIGNORE" ]]; then
  grep -qxF '.claude/workflow.json' "$GITIGNORE" || echo '.claude/workflow.json' >> "$GITIGNORE"
else
  echo '.claude/workflow.json' > "$GITIGNORE"
fi

echo "Autopilot configured in $TARGET"
