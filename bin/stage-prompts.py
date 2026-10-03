# /// script
# requires-python = ">=3.11"
# dependencies = ["PyYAML>=6.0,<7"]
# ///
"""Stage native prompt/agent formats and preflight managed asset destinations."""

import json
import os
import shutil
import sys
from pathlib import Path

import yaml


def frontmatter(path):
    opening, header, body = path.read_text().split("---", 2)
    if opening.strip():
        raise ValueError(f"Missing opening frontmatter: {path}")
    return yaml.safe_load(header), body.strip()


def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)


def files(root):
    if not root.is_dir():
        return []
    result = []
    for directory, dirs, names in os.walk(root, followlinks=False):
        for name in dirs + names:
            path = Path(directory) / name
            if path.is_symlink() or path.is_file():
                result.append(path.relative_to(root))
    return sorted(result)


def manifest(root, category):
    path = root / f".rules-manifest-{category}"
    entries = set(path.read_text().splitlines()) if path.is_file() else set()
    for entry in entries:
        if not entry or Path(entry).is_absolute() or ".." in Path(entry).parts:
            raise ValueError(f"Invalid manifest entry in {path}: {entry!r}")
    return entries


def check_manifest_parents(target, entries):
    for entry in entries:
        for parent in (target / entry).parents:
            if parent == target.parent:
                break
            if parent.is_symlink():
                raise ValueError(f"Refusing to retire files through symlink: {parent}")


def preflight(source, target, owned):
    check_manifest_parents(target, owned)
    for relative in files(source):
        output = target / relative
        # Never let rsync or cleanup traverse an unrelated directory link.
        for parent in output.parents:
            if parent == target.parent:
                break
            if parent.is_symlink():
                raise ValueError(f"Refusing to write through directory symlink: {parent}")
        if not output.exists() and not output.is_symlink():
            continue
        if (source / relative).is_symlink() and output.is_dir() and not output.is_symlink():
            for directory, dirs, names in os.walk(output, followlinks=False):
                if Path(directory) != output and not dirs and not names:
                    raise ValueError(f"Personal directory blocks skill link migration: {directory}")
            for child in files(output):
                existing = relative / child
                if str(existing) not in owned:
                    raise ValueError(f"Personal file blocks skill link migration: {target / existing}")
        elif str(relative) not in owned:
            raise ValueError(f"Unmanaged asset would be overwritten: {output}")


def main():
    repo, stage, home, codex = map(Path, sys.argv[1:])
    shared = home / ".agents/skills"
    roots = {"claude": home / ".claude", "cursor": home / ".cursor", "pi": home / ".pi/agent", "codex": codex}
    for directory in ("claude_links", "cursor_links", "codex_prompts", "prompts", "cursor_rules", "claude_agents", "cursor_agents", "codex_agents", "empty"):
        (stage / directory).mkdir(parents=True)

    for skill in sorted((repo / "skills").iterdir()):
        if skill.is_dir() and not skill.name.startswith("."):
            (stage / "claude_links" / skill.name).symlink_to(shared / skill.name)

    template = (repo / "prompts/AGENTS.md").read_text()
    write(stage / "cursor_rules/rules.mdc", "---\nalwaysApply: true\n---\n\n" + template)
    for prompt in sorted((repo / "prompts").glob("*.md")):
        if prompt.name == "AGENTS.md":
            continue
        metadata, body = frontmatter(prompt)
        if (repo / "skills" / prompt.stem).exists():
            raise ValueError(f"Prompt and shared skill share a name: {prompt.stem}")
        shutil.copy2(prompt, stage / "prompts" / prompt.name)
        metadata["name"] = prompt.stem
        metadata["disable-model-invocation"] = True
        skill = stage / "codex_prompts" / prompt.stem
        write(skill / "SKILL.md", "---\n" + yaml.safe_dump(metadata, sort_keys=False) + "---\n\n" + body + "\n")
        write(skill / "agents/openai.yaml", "policy:\n  allow_implicit_invocation: false\n")
        (stage / "cursor_links" / prompt.stem).symlink_to(codex / "skills" / prompt.stem)

    tool_names = {"read": "Read", "grep": "Grep", "find": "Glob", "ls": "LS", "bash": "Bash", "edit": "Edit", "write": "Write"}
    for agent in sorted((repo / "agents").glob("*.md")):
        metadata, body = frontmatter(agent)
        identity = {key: metadata[key] for key in ("name", "description")}
        tools = [tool.strip() for tool in metadata.get("tools", "").split(",") if tool.strip()]
        read_only = bool(tools) and not any(tool in tools for tool in ("edit", "write"))
        claude = dict(identity)
        if tools:
            claude["tools"] = ", ".join(tool_names[tool] for tool in tools)
        cursor = dict(identity)
        if read_only:
            cursor["readonly"] = True
        for harness, fields in (("claude", claude), ("cursor", cursor)):
            write(stage / f"{harness}_agents" / agent.name, "---\n" + yaml.safe_dump(fields, sort_keys=False) + "---\n\n" + body + "\n")
        native = {**identity, "developer_instructions": body}
        if read_only:
            native["sandbox_mode"] = "read-only"
        # JSON strings are valid TOML basic strings and escape arbitrary prompt bodies.
        write(stage / "codex_agents" / f"{agent.stem}.toml", "".join(f"{key} = {json.dumps(value, ensure_ascii=False)}\n" for key, value in native.items()))

    retired = {}
    for harness, root in roots.items():
        target = root / "skills"
        known = manifest(target, "skills")
        if harness == "cursor":
            known |= manifest(target, "prompt_skills")
        # Older manifests named whole skill folders. Expand from authored sources,
        # never from destination contents that can include personal additions.
        normalized = set()
        for entry in known:
            original = repo / "skills" / entry
            if entry == "workflow-orchestrator":
                original = repo / "pi/skills" / entry
            if original.is_dir():
                normalized.update(str(Path(entry) / child) for child in files(original))
            elif entry == "answer-style":
                normalized.add("answer-style/SKILL.md")
            else:
                normalized.add(entry)
        check_manifest_parents(target, normalized)
        for source in (repo / "skills").iterdir():
            relative = f"{source.name}/SKILL.md"
            existing = target / relative
            link_owned = source.name in manifest(target, "skill_links")
            if existing.exists() and relative not in normalized and not link_owned:
                raise ValueError(f"Unmanaged skill would duplicate shared installation: {existing}")
        retired[harness] = normalized
        write(stage / "retire" / harness, "".join(f"{entry}\n" for entry in sorted(normalized)))

    destinations = [
        (repo / "skills", shared, "skills", set()),
        (stage / "claude_links", roots["claude"] / "skills", "skill_links", retired["claude"]),
        (stage / "cursor_links", roots["cursor"] / "skills", "prompt_links", retired["cursor"]),
        (stage / "codex_prompts", codex / "skills", "prompt_skills", retired["codex"]),
        (stage / "prompts", roots["claude"] / "commands", "prompts", set()),
        (stage / "prompts", roots["pi"] / "prompts", "prompts", set()),
        (stage / "cursor_rules", roots["cursor"] / "rules", "rules", set()),
        (repo / "pi/skills", roots["pi"] / "skills", "pi_skills", retired["pi"]),
    ]
    for harness, root in roots.items():
        source = repo / "agents" if harness == "pi" else stage / f"{harness}_agents"
        destinations.append((source, root / "agents", "subagents", manifest(root / "agents", "pi_subagents")))
    for source, target, category, legacy in destinations:
        preflight(source, target, manifest(target, category) | legacy)


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        sys.exit(str(error))
