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
pi_root="${HOME}/.pi/agent"

mkdir -p "${codex_root}" "${claude_root}" "${cursor_root}" "${pi_root}"

DIM='\033[2m'
BOLD='\033[1m'
GREEN='\033[32m'
YELLOW='\033[33m'
RED='\033[31m'
CYAN='\033[36m'
RESET='\033[0m'

declare -A updated_files=()
declare -A added_files=()
declare -A removed_files=()
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

sync_overlay_dir() {
  local src="$1" dst="$2" category="$3"
  mkdir -p "$dst"
  collect_files "$src" "$category"

  local rsync_out
  rsync_out=$(rsync -a --itemize-changes "$src" "$dst") || true

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

sync_claude_subagents() {
  local src="$1" dst="$2"
  local tmp
  tmp=$(mktemp -d)

  for f in "$src"*; do
    [[ -e "$f" ]] || continue
    local base
    base=$(basename "$f")
    if [[ -f "$f" ]]; then
      awk '!/^model:[[:space:]]*openai-codex\// && !/^thinking:[[:space:]]*/' "$f" > "${tmp}/${base}"
    elif [[ -d "$f" ]]; then
      cp -R "$f" "${tmp}/${base}"
    fi
  done

  sync_dir "${tmp}/" "$dst" "subagents"
  rm -rf "$tmp"
}

remove_repo_entries() {
  local src="$1" dst="$2" category="$3"
  [[ -d "$dst" ]] || return 0

  for f in "$src"*; do
    [[ -e "$f" ]] || continue
    local base name
    base=$(basename "$f")
    [[ "$base" == .* ]] && continue
    name=$(strip_ext "$f")

    if [[ -e "${dst}${base}" ]]; then
      rm -rf "${dst}${base}"
      add_unique all_files[$category] "$name"
      add_unique removed_files[$category] "$name"
    fi
  done

  rmdir "$dst" 2>/dev/null || true
}

remove_path() {
  local dst="$1" category="$2" name="$3"
  [[ -e "$dst" ]] || return 0
  rm -rf "$dst"
  add_unique all_files[$category] "$name"
  add_unique removed_files[$category] "$name"
}

ensure_pi_setting_array_value() {
  local key="$1" value="$2" category="$3"
  local settings="${pi_root}/settings.json"
  add_unique all_files["$category"] "$value"

  if [[ ! -f "$settings" ]] || ! jq -e --arg key "$key" --arg value "$value" '.[$key] // [] | index($value)' "$settings" >/dev/null; then
    add_unique added_files["$category"] "$value"
  fi

  if [[ -f "$settings" ]]; then
    jq --arg key "$key" --arg value "$value" '. + {($key): (((.[$key] // []) + [$value]) | unique)}' \
      "$settings" > tmp.$$ && mv tmp.$$ "$settings"
  else
    jq -n --arg key "$key" --arg value "$value" '{($key): [$value]}' > "$settings"
  fi
}

ensure_pi_package() {
  ensure_pi_setting_array_value "packages" "$1" "pi_packages"
}

ensure_pi_skill_path() {
  local value="$1"
  local old_value="${2:-}"
  local settings="${pi_root}/settings.json"
  add_unique all_files["pi_skill_paths"] "$value"

  if [[ ! -f "$settings" ]] || ! jq -e --arg value "$value" '.skills // [] | index($value)' "$settings" >/dev/null; then
    add_unique added_files["pi_skill_paths"] "$value"
  fi

  if [[ -f "$settings" ]]; then
    jq --arg value "$value" --arg old_value "$old_value" \
      '. + {skills: (((.skills // []) | map(select(. != $old_value)) + [$value]) | unique)}' \
      "$settings" > tmp.$$ && mv tmp.$$ "$settings"
  else
    jq -n --arg value "$value" '{skills: [$value]}' > "$settings"
  fi
}

remove_path "${codex_root}/AGENTS.md" "codex_pruned" "AGENTS"

sync_file "${repo_root}/AGENTS.md" "${claude_root}/CLAUDE.md" "agents_md"
sync_file "${repo_root}/AGENTS.md" "${cursor_root}/AGENTS.md" "agents_md"
sync_file "${repo_root}/AGENTS.md" "${pi_root}/AGENTS.md" "agents_md"

remove_repo_entries "${repo_root}/skills/" "${codex_root}/skills/" "codex_pruned"
remove_repo_entries "${repo_root}/agents/" "${codex_root}/agents/" "codex_pruned"

sync_dir "${repo_root}/skills/" "${claude_root}/skills/" "skills"
sync_dir "${repo_root}/skills/" "${cursor_root}/skills/" "skills"
sync_dir "${repo_root}/skills/" "${pi_root}/skills/" "skills"

sync_claude_subagents "${repo_root}/agents/" "${claude_root}/agents/"
sync_dir "${repo_root}/agents/" "${cursor_root}/agents/" "subagents"
sync_dir "${repo_root}/agents/" "${pi_root}/agents/" "subagents"
sync_overlay_dir "${repo_root}/pi/agents/" "${pi_root}/agents/" "pi_subagents"
remove_path "${pi_root}/skills/long-execute" "pi_skills" "long-execute"
sync_overlay_dir "${repo_root}/pi/skills/" "${pi_root}/skills/" "pi_skills"

# Pi's extension directory may also contain user-managed extensions. Keep sync additive
# even under --clean, while removing the two repo-managed files replaced by workflow-runtime.
collect_files "${repo_root}/extensions/" "extensions"
remove_path "${pi_root}/extensions/workflow-indicator.ts" "extensions" "workflow-indicator"
remove_path "${pi_root}/extensions/long-execute.ts" "extensions" "long-execute"
sync_overlay_dir "${repo_root}/extensions/" "${pi_root}/extensions/" "extensions"

ensure_pi_package "npm:pi-tmux-subagents"
ensure_pi_skill_path "~/.pi/agent/skills" "~/.claude/skills"

sync_dir "${repo_root}/statusline/" "${claude_root}/statusline/" "statusline"

if [[ -f "${claude_root}/settings.json" ]]; then
  jq '.statusLine = ((.statusLine // {}) + {type: "command", command: "bash ~/.claude/statusline/minimal.sh"})' \
    "${claude_root}/settings.json" > tmp.$$ && mv tmp.$$ "${claude_root}/settings.json"
fi

if [[ "$SILENT" == false ]]; then

  format_items() {
    local category="$1"
    local all="${all_files[$category]:-}"
    local updated="${updated_files[$category]:-}"
    local added="${added_files[$category]:-}"
    local removed="${removed_files[$category]:-}"
    local output=""

    for item in $all; do
      if [[ " $added " == *" $item "* ]]; then
        output+="${GREEN}+${item}${RESET} "
      elif [[ " $removed " == *" $item "* ]]; then
        output+="${RED}-${item}${RESET} "
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
    [[ -n "${updated_files[$category]:-}" || -n "${added_files[$category]:-}" || -n "${removed_files[$category]:-}" ]]
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

  print_row_if_present() {
    local label="$1" category="$2" targets="$3"
    if [[ -n "${all_files[$category]:-}" ]]; then
      print_row "$label" "$category" "$targets"
    fi
  }

  echo ""
  echo -e "${BOLD}sync-prompts${RESET}$(if [[ -n "$DELETE_FLAG" ]]; then echo -e " ${DIM}--clean${RESET}"; fi)"
  echo ""

  print_row_if_present "codex pruned assets" "codex_pruned" "codex"
  print_row "AGENTS.md" "agents_md" "claude, cursor, pi"
  print_row "skills" "skills" "claude, cursor, pi"
  print_row "subagents" "subagents" "claude, cursor, pi"
  print_row "pi-only subagents" "pi_subagents" "pi"
  print_row "pi-only skills" "pi_skills" "pi"
  print_row "extensions" "extensions" "pi"
  print_row "pi packages" "pi_packages" "pi"
  print_row "pi loads skills from" "pi_skill_paths" "pi"
  print_row "statusline" "statusline" "claude"

  echo ""
  echo -e "  ${DIM}${GREEN}+new${RESET}  ${YELLOW}●updated${RESET}  ${RED}-removed${RESET}  ${DIM}unchanged${RESET}"
  echo ""
fi
