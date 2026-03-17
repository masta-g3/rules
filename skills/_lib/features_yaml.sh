#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required for skills/_lib/features_yaml.sh" >&2
  exit 1
fi

exec uv run --quiet "${SCRIPT_DIR}/features_yaml.py" "$@"
