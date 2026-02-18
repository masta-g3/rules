#!/usr/bin/env bash
set -euo pipefail

DELETE_FLAG=""
SILENT=false

for arg in "$@"; do
  case "$arg" in
    --clean) DELETE_FLAG="--delete" ;;
    --silent|-q) SILENT=true ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

codex_root="${HOME}/.codex"
claude_root="${HOME}/.claude"
cursor_root="${HOME}/.cursor"

mkdir -p "${codex_root}" "${claude_root}" "${cursor_root}"

DIM='\033[2m'
BOLD='\033[1m'
GREEN='\033[32m'
YELLOW='\033[33m'
CYAN='\033[36m'
RESET='\033[0m'

declare -A updated_files=()
declare -A added_files=()
declare -A all_files=()

add_unique() {
  local -n arr=$1
  local item=$2
  [[ " ${arr:-} " == *" $item "* ]] || arr+="$item "
}

strip_ext() {
  local name=$(basename "$1" .md)
  basename "$name" .sh
}

collect_files() {
  local src="$1" category="$2"
  [[ -n "${all_files[$category]:-}" ]] && return
  for f in "$src"*; do
    local name
    if [[ -d "$f" ]]; then
      name=$(basename "$f")
      [[ "$name" == .* || "$name" == _* ]] && continue
    elif [[ -f "$f" ]]; then
      name=$(strip_ext "$f")
      [[ "$name" == .* ]] && continue
    else
      continue
    fi
    all_files[$category]+="$name "
  done
}

sync_file() {
  local src="$1" dst="$2" category="$3"
  local name=$(strip_ext "$src")
  add_unique all_files[$category] "$name"
  if [[ ! -f "$dst" ]]; then
    add_unique added_files[$category] "$name"
  elif ! cmp -s "$src" "$dst"; then
    add_unique updated_files[$category] "$name"
  fi
  cp "$src" "$dst"
}

sync_dir() {
  local src="$1" dst="$2" category="$3"
  mkdir -p "$dst"
  collect_files "$src" "$category"

  local rsync_out
  rsync_out=$(rsync -a --itemize-changes $DELETE_FLAG "$src" "$dst") || true

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    local change_type="${line:0:1}"
    local file=$(echo "$line" | awk '{print $2}')
    local name=$(echo "$file" | cut -d/ -f1)
    name=$(strip_ext "$name")
    [[ "$name" == .* || "$name" == _* ]] && continue

    if [[ "$change_type" == ">" ]]; then
      if [[ "${line:1:1}" == "f" && "${line:3:1}" == "+" ]]; then
        add_unique added_files[$category] "$name"
      else
        add_unique updated_files[$category] "$name"
      fi
    fi
  done <<< "$rsync_out"
}

sync_file "${repo_root}/AGENTS.md" "${codex_root}/AGENTS.md" "agents_md"
sync_file "${repo_root}/AGENTS.md" "${claude_root}/CLAUDE.md" "agents_md"
sync_file "${repo_root}/AGENTS.md" "${cursor_root}/AGENTS.md" "agents_md"

sync_dir "${repo_root}/skills/" "${codex_root}/skills/" "skills"
sync_dir "${repo_root}/skills/" "${claude_root}/skills/" "skills"
sync_dir "${repo_root}/skills/" "${cursor_root}/skills/" "skills"

sync_dir "${repo_root}/agents/" "${codex_root}/agents/" "subagents"
sync_dir "${repo_root}/agents/" "${claude_root}/agents/" "subagents"
sync_dir "${repo_root}/agents/" "${cursor_root}/agents/" "subagents"

sync_dir "${repo_root}/statusline/" "${claude_root}/statusline/" "statusline"

if [[ -f "${claude_root}/settings.json" ]]; then
  jq '. + {statusLine: {type: "command", command: "bash ~/.claude/statusline/minimal.sh"}}' \
    "${claude_root}/settings.json" > tmp.$$ && mv tmp.$$ "${claude_root}/settings.json"
fi

if [[ "$SILENT" == false ]]; then

  format_items() {
    local category="$1"
    local all="${all_files[$category]:-}"
    local updated="${updated_files[$category]:-}"
    local added="${added_files[$category]:-}"
    local output=""

    for item in $all; do
      if [[ " $added " == *" $item "* ]]; then
        output+="${GREEN}+${item}${RESET} "
      elif [[ " $updated " == *" $item "* ]]; then
        output+="${YELLOW}●${item}${RESET} "
      else
        output+="${DIM}${item}${RESET} "
      fi
    done
    echo -e "$output"
  }

  has_changes() {
    local category="$1"
    [[ -n "${updated_files[$category]:-}" || -n "${added_files[$category]:-}" ]]
  }

  print_row() {
    local label="$1" category="$2" targets="$3"
    local items=$(format_items "$category")
    local indicator="${DIM}○${RESET}"
    if has_changes "$category"; then
      indicator="${GREEN}●${RESET}"
    fi

    if [[ -n "${all_files[$category]:-}" ]]; then
      echo -e "  ${indicator} ${CYAN}${label}${RESET} ${DIM}→ ${targets}${RESET}"
      echo -e "      ${items}"
    else
      echo -e "  ${DIM}○ ${label} → ${targets}${RESET}"
      echo -e "      ${DIM}(empty)${RESET}"
    fi
  }

  echo ""
  echo -e "${BOLD}sync-prompts${RESET}$(if [[ -n "$DELETE_FLAG" ]]; then echo -e " ${DIM}--clean${RESET}"; fi)"
  echo ""

  print_row "AGENTS.md" "agents_md" "codex, claude, cursor"
  print_row "skills" "skills" "codex, claude, cursor"
  print_row "subagents" "subagents" "codex, claude, cursor"
  print_row "statusline" "statusline" "claude"

  echo ""
  echo -e "  ${DIM}${GREEN}+new${RESET}  ${YELLOW}●updated${RESET}  ${DIM}unchanged${RESET}"
  echo ""
fi
