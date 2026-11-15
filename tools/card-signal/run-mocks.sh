#!/usr/bin/env bash
set -euo pipefail
exec node --experimental-strip-types "$(dirname "$0")/run-mocks.ts" "$@"
