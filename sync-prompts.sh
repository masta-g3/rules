#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

codex_root="${HOME}/.codex"
claude_root="${HOME}/.claude"

mkdir -p "${codex_root}" "${claude_root}"

cp "${repo_root}/AGENTS.md" "${codex_root}/AGENTS.md"
cp "${repo_root}/AGENTS.md" "${claude_root}/CLAUDE.md"

mkdir -p "${codex_root}/prompts" "${claude_root}/commands"

cp -R "${repo_root}/commands/." "${codex_root}/prompts/"
cp -R "${repo_root}/commands/." "${claude_root}/commands/"
