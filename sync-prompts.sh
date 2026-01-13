#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

codex_root="${HOME}/.codex"
claude_root="${HOME}/.claude"
cursor_root="${HOME}/.cursor"

mkdir -p "${codex_root}" "${claude_root}" "${cursor_root}"

cp "${repo_root}/AGENTS.md" "${codex_root}/AGENTS.md"
cp "${repo_root}/AGENTS.md" "${claude_root}/CLAUDE.md"
cp "${repo_root}/AGENTS.md" "${cursor_root}/AGENTS.md"

mkdir -p "${codex_root}/prompts" "${claude_root}/commands" "${cursor_root}/commands"

rsync -a --delete "${repo_root}/commands/" "${codex_root}/prompts/"
rsync -a --delete "${repo_root}/commands/" "${claude_root}/commands/"
rsync -a --delete "${repo_root}/commands/" "${cursor_root}/commands/"

mkdir -p "${claude_root}/agents"
rsync -a --delete "${repo_root}/.claude/agents/" "${claude_root}/agents/"

mkdir -p "${claude_root}/statusline"
rsync -a "${repo_root}/statusline/" "${claude_root}/statusline/"

# Merge statusLine config into settings.json
if [[ -f "${claude_root}/settings.json" ]]; then
  jq '. + {statusLine: {type: "command", command: "bash ~/.claude/statusline/minimal.sh"}}' \
    "${claude_root}/settings.json" > tmp.$$ && mv tmp.$$ "${claude_root}/settings.json"
fi
