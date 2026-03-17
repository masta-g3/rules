#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "PyYAML>=6.0,<7",
# ]
# ///

import argparse
import json
import re
import sys
from datetime import date
from pathlib import Path
from typing import Any, NoReturn

import yaml


class SafeYAMLLoader(yaml.SafeLoader):
    pass


SafeYAMLLoader.yaml_implicit_resolvers = {
    key: [(tag, regexp) for tag, regexp in resolvers if tag != "tag:yaml.org,2002:timestamp"]
    for key, resolvers in yaml.SafeLoader.yaml_implicit_resolvers.copy().items()
}


ID_PATTERN = re.compile(r"^(?P<epic>.+)-(?P<num>\d+)$")
CONTROL_CHAR_PATTERN = re.compile(r"[\x00-\x1f\x7f]")
INVALID_ID_CHARACTERS = {"?", "#", "%"}
STATUSES = {"pending", "in_progress", "done", "abandoned", "superseded"}
MUTABLE_STATUSES = STATUSES - {"done"}


COMMAND_SPECS = {
    "epics": {
        "summary": "List epic prefixes derived from tracked feature IDs.",
        "arguments": [
            {"name": "--file", "required": False, "type": "path", "default": "features.yaml"},
            {"name": "--output", "required": False, "type": "text|json", "default": "text"},
        ],
        "output_modes": ["text", "json"],
    },
    "next-id": {
        "summary": "Allocate the next sequential tracked ID for an epic.",
        "arguments": [
            {"name": "epic", "required": True, "type": "string"},
            {"name": "--file", "required": False, "type": "path", "default": "features.yaml"},
            {"name": "--output", "required": False, "type": "text|json", "default": "text"},
        ],
        "output_modes": ["text", "json"],
    },
    "next": {
        "summary": "Select the next actionable feature, preferring in-progress work first.",
        "arguments": [
            {"name": "--epic", "required": False, "type": "string"},
            {"name": "--file", "required": False, "type": "path", "default": "features.yaml"},
            {"name": "--output", "required": False, "type": "text|json|id", "default": "text"},
        ],
        "output_modes": ["text", "json", "id"],
    },
    "create": {
        "summary": "Append a new feature object to features.yaml.",
        "arguments": [
            {"name": "--json", "required": True, "type": "json-object"},
            {"name": "--file", "required": False, "type": "path", "default": "features.yaml"},
            {"name": "--dry-run", "required": False, "type": "flag", "default": False},
            {"name": "--output", "required": False, "type": "text|json", "default": "text"},
        ],
        "output_modes": ["text", "json"],
    },
    "update": {
        "summary": "Patch a tracked feature. V1 supports status and plan_file only.",
        "arguments": [
            {"name": "feature_id", "required": True, "type": "tracked-id"},
            {"name": "--json", "required": True, "type": "json-object"},
            {"name": "--file", "required": False, "type": "path", "default": "features.yaml"},
            {"name": "--dry-run", "required": False, "type": "flag", "default": False},
            {"name": "--output", "required": False, "type": "text|json", "default": "text"},
        ],
        "output_modes": ["text", "json"],
    },
    "complete": {
        "summary": "Finalize a tracked feature with an archived plan path.",
        "arguments": [
            {"name": "feature_id", "required": True, "type": "tracked-id"},
            {"name": "--plan-file", "required": True, "type": "path"},
            {"name": "--file", "required": False, "type": "path", "default": "features.yaml"},
            {"name": "--dry-run", "required": False, "type": "flag", "default": False},
            {"name": "--output", "required": False, "type": "text|json", "default": "text"},
        ],
        "output_modes": ["text", "json"],
    },
    "describe": {
        "summary": "Describe the helper contract or a specific command.",
        "arguments": [
            {"name": "command", "required": False, "type": "command"},
            {"name": "--output", "required": False, "type": "text|json", "default": "text"},
        ],
        "output_modes": ["text", "json"],
    },
}


def fail(message: str, code: int = 1) -> NoReturn:
    print(message, file=sys.stderr)
    raise SystemExit(code)


def load_features(path_str: str) -> list[dict]:
    path = Path(path_str)
    if not path.is_file():
        fail(f"features file not found: {path_str}")

    with path.open() as handle:
        data = yaml.load(handle, Loader=SafeYAMLLoader)

    if data is None:
        return []
    if not isinstance(data, list):
        fail(f"features file must contain a top-level sequence: {path_str}")
    if not all(isinstance(item, dict) for item in data):
        fail(f"features file must contain mapping entries: {path_str}")
    return data


def save_features(path_str: str, data: list[dict]) -> None:
    path = Path(path_str)
    with path.open("w") as handle:
        yaml.dump(data, handle, default_flow_style=False, sort_keys=False)


def sort_key(feature: dict) -> tuple[int, str, str]:
    priority = feature.get("priority")
    if isinstance(priority, bool):
        priority_value = int(priority)
    elif isinstance(priority, int):
        priority_value = priority
    elif isinstance(priority, str) and priority.isdigit():
        priority_value = int(priority)
    else:
        priority_value = 999
    return (
        priority_value,
        str(feature.get("created_at") or ""),
        str(feature.get("id") or ""),
    )


def require_feature(data: list[dict], feature_id: str) -> dict:
    for feature in data:
        if feature.get("id") == feature_id:
            return feature
    fail(f"feature not found in features.yaml: {feature_id}")


def ensure_plain_text(name: str, value: str) -> str:
    if CONTROL_CHAR_PATTERN.search(value):
        fail(f"{name} contains control characters")
    return value


def ensure_tracked_id(feature_id: str) -> str:
    ensure_plain_text("feature id", feature_id)
    if any(char in feature_id for char in INVALID_ID_CHARACTERS):
        fail(f"invalid feature id: {feature_id}")
    if not ID_PATTERN.match(feature_id):
        fail(f"invalid tracked feature id: {feature_id}")
    return feature_id


def ensure_epic(epic: str) -> str:
    epic = ensure_plain_text("epic", epic)
    if not epic.strip():
        fail("epic must not be empty")
    if any(char in epic for char in INVALID_ID_CHARACTERS):
        fail(f"invalid epic: {epic}")
    return epic


def ensure_status(status: str) -> str:
    status = ensure_plain_text("status", status)
    if status not in MUTABLE_STATUSES:
        valid = ", ".join(sorted(MUTABLE_STATUSES))
        fail(f"invalid status for update: {status}. valid values: {valid}. use complete for done")
    return status


def ensure_plan_path(path_str: str, *, require_existing: bool) -> str:
    path_str = ensure_plain_text("plan file", path_str)
    path = Path(path_str)
    if require_existing and not path.is_file():
        fail(f"archive file not found: {path_str}")
    return path_str


def parse_json_object(raw: str, *, value_name: str) -> dict:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        fail(f"invalid {value_name}: {exc}")
    if not isinstance(payload, dict):
        fail(f"{value_name} must decode to a JSON object")
    return payload


def feature_details(feature: dict) -> dict[str, Any]:
    details = {
        "id": feature.get("id"),
        "priority": feature.get("priority"),
        "depends_on": feature.get("depends_on", []) or [],
        "description": feature.get("description") or feature.get("title") or "(no description)",
    }
    if "status" in feature:
        details["status"] = feature.get("status")
    if "plan_file" in feature:
        details["plan_file"] = feature.get("plan_file")
    return details


def create_feature(path_str: str, payload: dict, *, dry_run: bool) -> dict[str, Any]:
    feature_id = payload.get("id")
    if not isinstance(feature_id, str):
        fail("create payload must include string field: id")
    ensure_tracked_id(feature_id)
    status = payload.get("status")
    if isinstance(status, str) and status not in STATUSES:
        valid = ", ".join(sorted(STATUSES))
        fail(f"invalid status in create payload: {status}. valid values: {valid}")
    if "plan_file" in payload and payload["plan_file"] is not None:
        if not isinstance(payload["plan_file"], str):
            fail("create payload field plan_file must be a string or null")
        ensure_plan_path(payload["plan_file"], require_existing=False)

    data = load_features(path_str)
    if any(feature.get("id") == feature_id for feature in data):
        fail(f"feature already exists in features.yaml: {feature_id}")

    result = dict(payload)
    if not dry_run:
        data.append(result)
        save_features(path_str, data)

    return {
        "command": "create",
        "changed": not dry_run,
        "dry_run": dry_run,
        "feature": feature_details(result),
    }


def validate_patch(patch: dict) -> dict[str, Any]:
    allowed_keys = {"status", "plan_file"}
    extra_keys = sorted(set(patch) - allowed_keys)
    if extra_keys:
        fail(f"unsupported update field(s): {', '.join(extra_keys)}")
    if not patch:
        fail("update payload must not be empty")

    clean_patch: dict[str, Any] = {}
    if "status" in patch:
        status = patch["status"]
        if not isinstance(status, str):
            fail("update field status must be a string")
        clean_patch["status"] = ensure_status(status)
    if "plan_file" in patch:
        plan_file = patch["plan_file"]
        if plan_file is None:
            clean_patch["plan_file"] = None
        elif isinstance(plan_file, str):
            clean_patch["plan_file"] = ensure_plan_path(plan_file, require_existing=False)
        else:
            fail("update field plan_file must be a string or null")
    return clean_patch


def update_feature(path_str: str, feature_id: str, patch: dict, *, dry_run: bool) -> dict[str, Any]:
    feature_id = ensure_tracked_id(feature_id)
    clean_patch = validate_patch(patch)
    data = load_features(path_str)
    feature = require_feature(data, feature_id)
    updated = dict(feature)
    updated.update(clean_patch)

    if not dry_run:
        feature.update(clean_patch)
        save_features(path_str, data)

    return {
        "command": "update",
        "changed": not dry_run,
        "dry_run": dry_run,
        "feature": feature_details(updated),
        "updated_fields": sorted(clean_patch),
    }


def complete_feature(
    path_str: str, feature_id: str, archive_path: str, *, dry_run: bool
) -> dict[str, Any]:
    feature_id = ensure_tracked_id(feature_id)
    archive_path = ensure_plan_path(archive_path, require_existing=True)
    data = load_features(path_str)
    feature = require_feature(data, feature_id)

    updated = dict(feature)
    updated["status"] = "done"
    updated["completed_at"] = date.today().isoformat()
    updated["plan_file"] = archive_path
    updated.pop("spec_file", None)

    if not dry_run:
        feature["status"] = updated["status"]
        feature["completed_at"] = updated["completed_at"]
        feature["plan_file"] = archive_path
        feature.pop("spec_file", None)
        save_features(path_str, data)

    return {
        "command": "complete",
        "changed": not dry_run,
        "dry_run": dry_run,
        "feature": {
            **feature_details(updated),
            "completed_at": updated["completed_at"],
        },
    }


def list_epics(path_str: str) -> dict[str, Any]:
    data = load_features(path_str)
    epics = {
        match.group("epic")
        for feature in data
        if isinstance(feature.get("id"), str) and (match := ID_PATTERN.match(feature["id"]))
    }
    return {"command": "epics", "epics": sorted(epics)}


def next_id(path_str: str, epic: str) -> dict[str, Any]:
    epic = ensure_epic(epic)
    data = load_features(path_str)
    max_id = 0
    for feature in data:
        feature_id = feature.get("id")
        if not isinstance(feature_id, str):
            continue
        match = ID_PATTERN.match(feature_id)
        if not match or match.group("epic") != epic:
            continue
        max_id = max(max_id, int(match.group("num")))
    return {"command": "next-id", "epic": epic, "next_id": f"{epic}-{max_id + 1:03d}"}


def filter_by_epic(data: list[dict], epic_filter: str | None) -> list[dict]:
    if not epic_filter:
        return data
    prefix = f"{epic_filter}-"
    return [feature for feature in data if str(feature.get("id", "")).startswith(prefix)]


def select_next_feature(path_str: str, epic_filter: str | None) -> dict[str, Any]:
    if epic_filter:
        ensure_epic(epic_filter)

    path = Path(path_str)
    if not path.is_file():
        return {
            "command": "next",
            "epic": epic_filter,
            "recommended": None,
            "suggested_plan_file": None,
            "in_progress": [],
            "ready": [],
            "blocked": [],
            "pending_count": 0,
            "missing_file": True,
        }

    data = load_features(path_str)
    scoped = filter_by_epic(data, epic_filter)
    resolved = {feature.get("id") for feature in data if feature.get("status") == "done"}

    in_progress = sorted(
        [feature for feature in scoped if feature.get("status") == "in_progress"],
        key=sort_key,
    )
    ready = sorted(
        [
            feature
            for feature in scoped
            if feature.get("status") == "pending"
            and all(dep in resolved for dep in feature.get("depends_on", []) or [])
        ],
        key=sort_key,
    )

    blocked = []
    for feature in scoped:
        if feature.get("status") != "pending":
            continue
        deps = feature.get("depends_on", []) or []
        missing = [str(dep) for dep in deps if dep not in resolved]
        if missing:
            blocked.append((feature, missing))
    blocked.sort(key=lambda item: sort_key(item[0]))

    recommended = in_progress[0] if in_progress else (ready[0] if ready else None)
    blocked_details = []
    for feature, missing in blocked:
        details = feature_details(feature)
        details["missing_dependencies"] = missing
        blocked_details.append(details)

    return {
        "command": "next",
        "epic": epic_filter,
        "recommended": recommended.get("id") if recommended else None,
        "suggested_plan_file": f"docs/plans/{recommended['id']}.md" if recommended else None,
        "in_progress": [feature_details(feature) for feature in in_progress],
        "ready": [feature_details(feature) for feature in ready],
        "blocked": blocked_details,
        "pending_count": sum(1 for feature in scoped if feature.get("status") == "pending"),
        "missing_file": False,
    }


def describe_command(command_name: str | None) -> dict[str, Any]:
    if command_name:
        if command_name not in COMMAND_SPECS:
            fail(f"unknown command for describe: {command_name}")
        return {
            "entrypoint": "skills/_lib/features_yaml.sh",
            "implementation": "skills/_lib/features_yaml.py",
            "note": "Use features_yaml.sh as the supported entrypoint.",
            "target_command": command_name,
            **COMMAND_SPECS[command_name],
        }

    commands = []
    for name in sorted(COMMAND_SPECS):
        commands.append({"name": name, **COMMAND_SPECS[name]})
    return {
        "entrypoint": "skills/_lib/features_yaml.sh",
        "implementation": "skills/_lib/features_yaml.py",
        "note": "Use features_yaml.sh as the supported entrypoint.",
        "commands": commands,
    }


def emit_json(result: dict[str, Any]) -> None:
    print(json.dumps(result, indent=2, sort_keys=False))


def emit_text(result: dict[str, Any]) -> None:
    command = result["command"]
    if command == "epics":
        for epic in result["epics"]:
            print(epic)
        return

    if command == "next-id":
        print(result["next_id"])
        return

    if command == "next":
        if result.get("missing_file"):
            print("No features.yaml found. Create one with /ticket-init or /epic-init.")
            return

        recommended = result["recommended"]
        if recommended is None:
            epic_context = f"epic {result['epic']}" if result["epic"] else "all features"
            print(
                f"No ready features in {epic_context}. "
                f"{result['pending_count']} pending, {len(result['blocked'])} blocked by unresolved dependencies."
            )
            if result["blocked"]:
                print()
                print("BLOCKED")
                for feature in result["blocked"][:3]:
                    print(
                        f"- {feature['id']} -> waiting on "
                        f"{', '.join(feature['missing_dependencies'])}"
                    )
                remaining = len(result["blocked"]) - 3
                if remaining > 0:
                    print(f"... {remaining} more blocked")
            return

        print("IN PROGRESS")
        if not result["in_progress"]:
            print("none")
        else:
            for feature in result["in_progress"]:
                print(
                    f"- {feature['id']} (priority {feature['priority'] or '-'}): "
                    f"{feature['description']}"
                )

        print()
        print("READY OPTIONS")
        if not result["ready"]:
            print("none")
        else:
            for index, feature in enumerate(result["ready"][:3], start=1):
                deps = feature["depends_on"]
                deps_text = "none" if not deps else ", ".join(str(dep) for dep in deps)
                print(
                    f"{index}. {feature['id']} (priority {feature['priority'] or '-'}, "
                    f"deps: {deps_text})"
                )
                print(f"   {feature['description']}")

        print()
        print("RECOMMENDED NEXT")
        print(recommended)
        print(f"Suggested plan file: {result['suggested_plan_file']}")
        return

    if command in {"create", "update", "complete"}:
        action = {"create": "created", "update": "updated", "complete": "completed"}[command]
        prefix = "Dry run:" if result["dry_run"] else action.capitalize() + ":"
        print(f"{prefix} {result['feature']['id']}")
        return

    if command == "describe":
        if "target_command" in result:
            print(f"{result['target_command']}: {result['summary']}")
            print(f"Entrypoint: {result['entrypoint']}")
            print(f"Output: {', '.join(result['output_modes'])}")
            for argument in result["arguments"]:
                requirement = "required" if argument["required"] else "optional"
                default = argument.get("default")
                suffix = "" if default is None else f" (default: {default})"
                print(
                    f"- {argument['name']} [{argument['type']}, {requirement}]{suffix}"
                )
            return

        print(f"Entrypoint: {result['entrypoint']}")
        print(result["note"])
        for command_spec in result["commands"]:
            print(f"- {command_spec['name']}: {command_spec['summary']}")
        return

    fail(f"no text emitter for command: {command}")


def emit_id(result: dict[str, Any]) -> None:
    if result["command"] != "next":
        fail("--output id is only supported for the next command")
    if result.get("missing_file"):
        raise SystemExit(1)
    recommended = result["recommended"]
    if recommended is None:
        raise SystemExit(1)
    print(recommended)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Repo-local helper for deterministic features.yaml operations."
    )
    parser.add_argument("--file", dest="global_file", default=argparse.SUPPRESS)
    parser.add_argument(
        "--output",
        dest="global_output",
        default=argparse.SUPPRESS,
        choices=("text", "json", "id"),
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    file_parent = argparse.ArgumentParser(add_help=False)
    file_parent.add_argument("--file", default=argparse.SUPPRESS)

    read_output_parent = argparse.ArgumentParser(add_help=False)
    read_output_parent.add_argument(
        "--output", default=argparse.SUPPRESS, choices=("text", "json")
    )

    mutation_parent = argparse.ArgumentParser(add_help=False)
    mutation_parent.add_argument(
        "--output", default=argparse.SUPPRESS, choices=("text", "json")
    )
    mutation_parent.add_argument("--dry-run", action="store_true")

    epics = subparsers.add_parser("epics", parents=[file_parent, read_output_parent])
    epics.set_defaults(handler=handle_epics)

    next_id_parser = subparsers.add_parser("next-id", parents=[file_parent, read_output_parent])
    next_id_parser.add_argument("epic")
    next_id_parser.set_defaults(handler=handle_next_id)

    next_parser = subparsers.add_parser("next", parents=[file_parent])
    next_parser.add_argument("--epic")
    next_parser.add_argument(
        "--output", default=argparse.SUPPRESS, choices=("text", "json", "id")
    )
    next_parser.set_defaults(handler=handle_next)

    create = subparsers.add_parser("create", parents=[file_parent, mutation_parent])
    create.add_argument("--json", required=True)
    create.set_defaults(handler=handle_create)

    update = subparsers.add_parser("update", parents=[file_parent, mutation_parent])
    update.add_argument("feature_id")
    update.add_argument("--json", required=True)
    update.set_defaults(handler=handle_update)

    complete = subparsers.add_parser("complete", parents=[file_parent, mutation_parent])
    complete.add_argument("feature_id")
    complete.add_argument("--plan-file", required=True)
    complete.set_defaults(handler=handle_complete)

    describe = subparsers.add_parser("describe")
    describe.add_argument("describe_command", nargs="?")
    describe.add_argument("--output", default=argparse.SUPPRESS, choices=("text", "json"))
    describe.set_defaults(handler=handle_describe)

    return parser


def handle_epics(args: argparse.Namespace) -> dict[str, Any]:
    return list_epics(args.file)


def handle_next_id(args: argparse.Namespace) -> dict[str, Any]:
    return next_id(args.file, args.epic)


def handle_next(args: argparse.Namespace) -> dict[str, Any]:
    return select_next_feature(args.file, args.epic)


def handle_create(args: argparse.Namespace) -> dict[str, Any]:
    payload = parse_json_object(args.json, value_name="create payload")
    return create_feature(args.file, payload, dry_run=args.dry_run)


def handle_update(args: argparse.Namespace) -> dict[str, Any]:
    patch = parse_json_object(args.json, value_name="update payload")
    return update_feature(args.file, args.feature_id, patch, dry_run=args.dry_run)


def handle_complete(args: argparse.Namespace) -> dict[str, Any]:
    return complete_feature(args.file, args.feature_id, args.plan_file, dry_run=args.dry_run)


def handle_describe(args: argparse.Namespace) -> dict[str, Any]:
    return {"command": "describe", **describe_command(args.describe_command)}


def main(argv: list[str]) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.file = getattr(args, "file", getattr(args, "global_file", "features.yaml"))
    args.output = getattr(args, "output", getattr(args, "global_output", "text"))
    result = args.handler(args)

    if args.output == "json":
        emit_json(result)
    elif args.output == "id":
        emit_id(result)
    else:
        emit_text(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
