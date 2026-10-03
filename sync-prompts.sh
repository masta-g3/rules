#!/usr/bin/env bash
set -euo pipefail

SILENT=false

for arg in "$@"; do
  case "$arg" in
    --silent|-q) SILENT=true ;;
  esac
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

codex_root="${CODEX_HOME:-${HOME}/.codex}"
shared_skills="${HOME}/.agents/skills"
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
  [[ -d "$src" ]] || return 0

  local rsync_out
  rsync_out=$(rsync -a --itemize-changes "$src" "$dst")

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    local change_type="${line:0:1}"
    local file=$(echo "$line" | awk '{print $2}')
    local name=$(echo "$file" | cut -d/ -f1)
    name=$(strip_ext "$name")
    [[ "$name" == .* || "$name" == _* ]] && continue

    if [[ "$change_type" == ">" || "${line:1:1}" == "L" ]]; then
      if [[ "${line:3:1}" == "+" ]]; then
        add_unique added_files[$category] "$name"
      else
        add_unique updated_files[$category] "$name"
      fi
    fi
  done <<< "$rsync_out"
}

# Track individual files so nested removals preserve local additions.
# Legacy directory entries are replaced with current source file paths, never
# expanded from the destination. Explicit seeds retire known legacy assets.
prune_and_record() {
  local src="$1" dst="$2" category="$3"
  shift 3
  local seed=("$@")
  local manifest="${dst}.rules-manifest-${category}"
  mkdir -p "$dst"

  local current=() f base parent
  if [[ -d "$src" ]]; then
    while IFS= read -r f; do
      current+=("${f#./}")
    done < <(cd "$src" && find . \( -type f -o -type l \) | LC_ALL=C sort)
  fi

  for base in "${seed[@]}"; do
    if [[ ! -e "${src}${base}" && -e "${dst}${base}" ]]; then
      rm -rf "${dst:?}${base}"
      add_unique all_files[$category] "$(strip_ext "$base")"
      add_unique removed_files[$category] "$(strip_ext "$base")"
    fi
  done

  local known=()
  if [[ -f "$manifest" ]]; then
    while IFS= read -r base; do
      [[ -n "$base" ]] && known+=("$base")
    done < "$manifest"
  fi

  for base in "${known[@]}"; do
    local stale=true
    for f in "${current[@]}"; do
      if [[ "$f" == "$base" ]]; then
        stale=false
        break
      fi
    done
    if [[ "$stale" == true && ( -f "${dst}${base}" || -L "${dst}${base}" ) ]]; then
      rm -f "${dst}${base}"
      add_unique all_files[$category] "$(strip_ext "${base%%/*}")"
      add_unique removed_files[$category] "$(strip_ext "${base%%/*}")"
      parent=$(dirname "$base")
      while [[ "$parent" != "." ]]; do
        rmdir "${dst}${parent}" 2>/dev/null || break
        parent=$(dirname "$parent")
      done
    fi
  done

  : > "$manifest"
  if (( ${#current[@]} > 0 )); then
    printf '%s\n' "${current[@]}" > "$manifest"
  fi
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
  local value="$1" source package_path
  local settings="${pi_root}/settings.json"
  if [[ "$value" == npm:* && -f "$settings" ]]; then
    while IFS= read -r source; do
      case "$source" in
        npm:*|git:*|http:*|https:*|ssh:*) continue ;;
        '~/'*) package_path="${HOME}/${source#\~/}" ;;
        /*) package_path="$source" ;;
        *) package_path="${pi_root}/${source}" ;;
      esac
      if [[ -f "${package_path}/package.json" ]] &&
        jq -e --arg name "${value#npm:}" '.name == $name' "${package_path}/package.json" >/dev/null; then
        add_unique all_files["pi_packages"] "$source"
        return
      fi
    done < <(jq -r '.packages // [] | .[] | if type == "string" then . else .source end' "$settings")
  fi
  ensure_pi_setting_array_value "packages" "$value" "pi_packages"
}

remove_pi_legacy_skill_paths() {
  local settings="${pi_root}/settings.json"
  [[ -f "$settings" ]] || return 0
  jq 'if has("skills") then .skills |= map(select(. != "~/.claude/skills" and . != "~/.pi/agent/skills")) else . end' \
    "$settings" > "${stage}/pi-settings.json"
  if ! cmp -s "$settings" "${stage}/pi-settings.json"; then
    cp "${stage}/pi-settings.json" "$settings"
  fi
}

# Prepare and check every new destination before changing installed assets.
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
uv run --script "${repo_root}/bin/stage-prompts.py" "$repo_root" "$stage" "$HOME" "$codex_root"

sync_file "${repo_root}/prompts/AGENTS.md" "${claude_root}/CLAUDE.md" "agents_md"
sync_file "${repo_root}/prompts/AGENTS.md" "${codex_root}/AGENTS.md" "agents_md"
sync_file "${repo_root}/prompts/AGENTS.md" "${pi_root}/AGENTS.md" "agents_md"

# Retire only manifest-owned copies. Personal files and untracked legacy assets stay.
for harness in claude cursor codex pi; do
  root_var="${harness}_root"
  target="${!root_var}/skills/"
  mkdir -p "$target"
  cp "${stage}/retire/${harness}" "${target}.rules-manifest-skills"
  prune_and_record "${stage}/empty/" "$target" "skills"
done
rm -f "${cursor_root}/skills/.rules-manifest-prompt_skills"

prune_and_record "${repo_root}/skills/" "${shared_skills}/" "skills"
sync_dir "${repo_root}/skills/" "${shared_skills}/" "skills"
prune_and_record "${stage}/claude_links/" "${claude_root}/skills/" "skill_links"
sync_dir "${stage}/claude_links/" "${claude_root}/skills/" "skill_links"

prune_and_record "${stage}/prompts/" "${claude_root}/commands/" "prompts"
prune_and_record "${stage}/prompts/" "${pi_root}/prompts/" "prompts"
sync_dir "${stage}/prompts/" "${claude_root}/commands/" "prompts"
sync_dir "${stage}/prompts/" "${pi_root}/prompts/" "prompts"
prune_and_record "${stage}/codex_prompts/" "${codex_root}/skills/" "prompt_skills"
sync_dir "${stage}/codex_prompts/" "${codex_root}/skills/" "prompt_skills"
prune_and_record "${stage}/cursor_links/" "${cursor_root}/skills/" "prompt_links"
sync_dir "${stage}/cursor_links/" "${cursor_root}/skills/" "prompt_links"
prune_and_record "${stage}/cursor_rules/" "${cursor_root}/rules/" "rules"
sync_dir "${stage}/cursor_rules/" "${cursor_root}/rules/" "rules"

for harness in claude cursor codex; do
  root_var="${harness}_root"
  prune_and_record "${stage}/${harness}_agents/" "${!root_var}/agents/" "subagents"
  sync_dir "${stage}/${harness}_agents/" "${!root_var}/agents/" "subagents"
done
prune_and_record "${repo_root}/agents/" "${pi_root}/agents/" "subagents"
sync_dir "${repo_root}/agents/" "${pi_root}/agents/" "subagents"

# Shared subagents now own the former Pi-only definitions.
rm -f "${pi_root}/agents/.rules-manifest-pi_subagents"
prune_and_record "${repo_root}/pi/skills/" "${pi_root}/skills/" "pi_skills" long-execute focus
sync_dir "${repo_root}/pi/skills/" "${pi_root}/skills/" "pi_skills"

prune_and_record "${repo_root}/extensions/" "${pi_root}/extensions/" "extensions" long-execute.ts workflow-indicator.ts
sync_dir "${repo_root}/extensions/" "${pi_root}/extensions/" "extensions"

ensure_pi_package "npm:pi-tmux-subagents"
remove_pi_legacy_skill_paths

prune_and_record "${repo_root}/statusline/" "${claude_root}/statusline/" "statusline"
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

  echo ""
  echo -e "${BOLD}sync-prompts${RESET}"
  echo ""

  print_row "prompts/AGENTS.md" "agents_md" "claude, codex, pi"
  print_row "Cursor user rules" "rules" "cursor"
  print_row "prompts" "prompts" "claude commands, pi prompts"
  print_row "prompt skills" "prompt_skills" "codex"
  print_row "prompt links" "prompt_links" "cursor"
  print_row "shared skills" "skills" "~/.agents/skills"
  print_row "skill links" "skill_links" "claude"
  print_row "subagents" "subagents" "claude, cursor, codex, pi"
  print_row "pi-only skills" "pi_skills" "pi"
  print_row "extensions" "extensions" "pi"
  print_row "pi packages" "pi_packages" "pi"
  print_row "statusline" "statusline" "claude"

  echo ""
  echo -e "  ${DIM}${GREEN}+new${RESET}  ${YELLOW}●updated${RESET}  ${RED}-removed${RESET}  ${DIM}unchanged${RESET}"
  echo ""
fi
