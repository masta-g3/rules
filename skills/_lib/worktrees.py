#!/usr/bin/env python3
"""Exact, portable worktree records for agent-owned task worktrees."""

from __future__ import annotations

import argparse
import fcntl
import filecmp
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

VERSION = 1
OWNER = "rules"
STATES = {"active", "awaiting-merge", "cleanup-pending", "check-needed"}
TICKET = re.compile(r"^[A-Za-z][A-Za-z0-9-]{0,79}$")
MAX_REPOS = 16
MAX_DECISIONS = 200
MAX_TEXT = 240


def fail(message: str) -> None:
    raise ValueError(message)


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def absolute(value: str, field: str) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        fail(f"{field} must be an absolute path")
    return path.resolve()


def root_path(value: str | None) -> Path:
    raw = value or os.environ.get("AGENT_WORKTREES_DIR", "~/.local/share/agent-worktrees")
    return absolute(raw, "worktree root")


def git(cwd: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(["git", "-C", str(cwd), *args], text=True, capture_output=True)
    if check and result.returncode:
        fail(f"Git query failed at {cwd}: {result.stderr.strip() or result.stdout.strip()}")
    return result


def git_path(cwd: Path, name: str) -> Path:
    value = git(cwd, "rev-parse", "--path-format=absolute", "--git-path", name).stdout.strip()
    return Path(value).resolve()


def branch_at(path: Path) -> str:
    value = git(path, "symbolic-ref", "--quiet", "--short", "HEAD", check=False)
    if value.returncode:
        fail(f"Worktree at {path} is detached or its branch cannot be queried")
    return value.stdout.strip()


def common_dir(path: Path) -> Path:
    return Path(git(path, "rev-parse", "--path-format=absolute", "--git-common-dir").stdout.strip()).resolve()


def repository_root(path: Path) -> Path:
    root = Path(git(path, "rev-parse", "--show-toplevel").stdout.strip()).resolve()
    if path.resolve() != root: fail(f"Repository path must equal its Git top-level root: {path}")
    return root


def parse_repos(values: list[str], operation: str) -> list[dict]:
    if not 1 <= len(values) <= MAX_REPOS:
        fail(f"Specify between 1 and {MAX_REPOS} repositories")
    repos = []
    labels: set[str] = set()
    primary = 0
    for raw in values:
        try:
            item = json.loads(raw)
        except json.JSONDecodeError as exc:
            fail(f"Invalid --repo JSON: {exc}")
        if not isinstance(item, dict):
            fail("Each --repo must be a JSON object")
        required = {"label", "source", "branch", "target", "role"}
        if operation == "create": required.add("base")
        else: required.add("worktree")
        missing = sorted(required - item.keys())
        if missing:
            fail(f"Repository is missing: {', '.join(missing)}")
        label = item["label"]
        if not isinstance(label, str) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", label):
            fail("Repository label is invalid")
        if label in labels:
            fail(f"Repository label collides: {label}")
        labels.add(label)
        if item["role"] not in {"primary", "additional"}:
            fail("Repository role must be primary or additional")
        primary += item["role"] == "primary"
        for field in ("branch", "target") + (("base",) if operation == "create" else ()):
            if not isinstance(item[field], str) or not item[field] or len(item[field]) > MAX_TEXT:
                fail(f"Repository {field} is invalid")
        if not isinstance(item["source"], str) or len(item["source"]) > 1024:
            fail("Repository source path is invalid")
        if operation == "register" and (not isinstance(item["worktree"], str) or len(item["worktree"]) > 1024):
            fail("Repository worktree path is invalid")
        normalized = {
            "label": label,
            "source": str(absolute(item["source"], "source")),
            "branch": item["branch"],
            "target": item["target"],
            "role": item["role"],
        }
        if operation == "create": normalized["base"] = item["base"]
        else: normalized["worktree"] = str(absolute(item["worktree"], "worktree"))
        repos.append(normalized)
    if primary != 1:
        fail("Exactly one repository must have role primary")
    sources = [item["source"] for item in repos]
    if len(set(sources)) != len(sources): fail("Duplicate resolved source repository identity")
    if operation == "register":
        worktrees = [item["worktree"] for item in repos]
        if len(set(worktrees)) != len(worktrees): fail("Duplicate resolved worktree identity")
    return repos


def atomic_write(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as stream:
            json.dump(data, stream, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


@contextmanager
def locked(record_path: Path):
    lock_path = Path(f"{record_path}.lock")
    lock_path.parent.mkdir(parents=True, exist_ok=True)
    with lock_path.open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def load(path: Path) -> dict:
    try:
        record = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"Cannot read worktree record: {exc}")
    if record.get("version") != VERSION or record.get("owner") != OWNER or record.get("recordPath") != str(path):
        fail("Worktree record identity is invalid")
    return record


def save(path: Path, record: dict) -> None:
    record["revision"] = int(record.get("revision", 0)) + 1
    record["updatedAt"] = now()
    atomic_write(path, record)


def membership(source: Path) -> dict[Path, dict[str, str]]:
    result = git(source, "worktree", "list", "--porcelain")
    found: dict[Path, dict[str, str]] = {}
    current: dict[str, str] = {}
    for line in (result.stdout + "\n").splitlines():
        if not line:
            if "worktree" in current: found[Path(current["worktree"]).resolve()] = current
            current = {}
        elif " " in line:
            key, value = line.split(" ", 1)
            current[key] = value
        else:
            current[line] = "true"
    return found


def validate_mapping(repo: dict) -> None:
    source = Path(repo["source"])
    worktree = Path(repo["worktree"])
    source_root = repository_root(source)
    worktree_root = repository_root(worktree)
    if source_root == worktree_root: fail(f"Repository source and worktree must be distinct top-level roots for {repo['label']}")
    if not source.is_dir() or common_dir(source_root) != common_dir(worktree_root):
        fail(f"Source/worktree Git identity mismatch for {repo['label']}")
    if worktree not in membership(source):
        fail(f"Worktree is not registered for {repo['label']}")
    actual = branch_at(worktree)
    if actual != repo["branch"]:
        fail(f"Worktree branch mismatch for {repo['label']}: expected {repo['branch']}, got {actual}")


def validate_distinct_sources(repos: list[dict]) -> None:
    identities: set[Path] = set()
    for item in repos:
        identity = common_dir(Path(item["source"]))
        if identity in identities: fail("Repository entries share one Git common directory")
        identities.add(identity)


def validate_record_location(record_path: Path, repos: list[dict]) -> None:
    location = record_path.resolve()
    for item in repos:
        worktree = Path(item["worktree"]).resolve()
        if location == worktree or location.is_relative_to(worktree):
            fail(f"Durable worktree record must remain outside registered worktree {worktree}")


def initial_record(ticket: str, task_id: str, path: Path, repos: list[dict]) -> dict:
    primary = next(item for item in repos if item["role"] == "primary")
    return {
        "version": VERSION, "id": task_id, "revision": 0, "owner": OWNER,
        "ticket": ticket.lower(), "recordPath": str(path), "primaryRepository": primary["label"],
        "authoredRoot": primary.get("worktree"), "state": "active", "terminalOutcome": None,
        "verifiedAt": None, "issue": None, "artifactDispositions": [], "repositories": repos,
        "createdAt": now(), "updatedAt": now(),
    }


def create(args: argparse.Namespace) -> dict:
    if args.hub_owned: fail("Hub-owned worktrees must be reused through Hub, not claimed by Rules")
    if not TICKET.fullmatch(args.ticket): fail("Ticket identity is invalid")
    root = root_path(args.root)
    repos = parse_repos(args.repo, "create")
    for item in repos: repository_root(Path(item["source"]))
    validate_distinct_sources(repos)
    for item in repos:
        source = Path(item["source"])
        if root == source or root.is_relative_to(source):
            fail(f"External worktree root must not be inside source repository {source}")
        common_dir(source)
    task_id = uuid.uuid4().hex[:12]
    task_dir = root / f"{args.ticket.lower()}-{task_id}"
    path = task_dir / "worktree.json"
    registered = [{"worktree": str(worktree)} for item in repos for worktree in membership(Path(item["source"]))]
    validate_record_location(path, registered)
    mapped = []
    destinations: set[Path] = set()
    for item in repos:
        destination = task_dir / item["label"]
        if destination in destinations or destination.exists(): fail("Worktree destination collision")
        destinations.add(destination)
        mapped.append({**item, "worktree": str(destination), "start": git(Path(item["source"]), "rev-parse", item["base"]).stdout.strip(), "state": "active", "outcome": None, "verifiedAt": None, "issue": None})
    record = initial_record(args.ticket, task_id, path, mapped)
    with locked(path):
        save(path, record)
        created: list[dict] = []
        try:
            for item in mapped:
                git(Path(item["source"]), "worktree", "add", "-b", item["branch"], item["worktree"], item["base"])
                created.append(item)
                validate_mapping(item)
                save(path, record)
        except Exception as exc:
            record["state"] = "check-needed"
            record["issue"] = str(exc)[:MAX_TEXT]
            for item in reversed(created):
                status = git(Path(item["worktree"]), "status", "--porcelain", check=False)
                if status.returncode == 0 and not status.stdout:
                    removed = git(Path(item["source"]), "worktree", "remove", item["worktree"], check=False)
                    if removed.returncode == 0:
                        item["state"] = "check-needed"
                        item["issue"] = "Creation rolled back; branch was retained"
            for item in mapped:
                try:
                    validate_mapping(item)
                except ValueError:
                    item["state"] = "check-needed"
                    item["issue"] = item.get("issue") or "Worktree creation did not complete; verify the retained branch and path"
                else:
                    item["state"] = "active"
                    item["issue"] = None
            save(path, record)
            raise
    return record


def register(args: argparse.Namespace) -> dict:
    if args.hub_owned: fail("Hub-owned worktrees cannot be registered as Rules-owned")
    if not TICKET.fullmatch(args.ticket): fail("Ticket identity is invalid")
    root = root_path(args.root)
    repos = parse_repos(args.repo, "register")
    for item in repos:
        repository_root(Path(item["source"]))
        repository_root(Path(item["worktree"]))
    validate_distinct_sources(repos)
    for item in repos:
        source = Path(item["source"])
        if source == Path(item["worktree"]): fail("Repository source and worktree must be different paths")
        if root == source or root.is_relative_to(source):
            fail(f"External worktree record root must not be inside source repository {source}")
    task_id = uuid.uuid4().hex[:12]
    path = root / f"{args.ticket.lower()}-{task_id}" / "worktree.json"
    mapped = []
    for item in repos:
        entry = {**item, "start": git(Path(item["worktree"]), "rev-parse", "HEAD").stdout.strip(), "state": "active", "outcome": None, "verifiedAt": None, "issue": None}
        validate_mapping(entry)
        mapped.append(entry)
    validate_record_location(path, mapped)
    record = initial_record(args.ticket, task_id, path, mapped)
    with locked(path): save(path, record)
    return record


def inspect_record(args: argparse.Namespace) -> dict:
    path = absolute(args.record, "record")
    record = load(path)
    results = []
    for item in record["repositories"]:
        worktree = Path(item["worktree"])
        status, issue = "valid", None
        if item["state"] == "cleaned":
            try:
                registered = worktree in membership(Path(item["source"]))
            except ValueError as exc:
                status, issue = "query-failed", str(exc)
            else:
                if not worktree.exists() and not registered:
                    status = "cleaned"
                else:
                    status = "mismatched"
                    problem = []
                    if worktree.exists(): problem.append("directory still exists")
                    if registered: problem.append("Git registration still exists")
                    issue = f"Cleaned record mismatch: {', '.join(problem)}"
        elif not worktree.exists():
            status, issue = "missing", "worktree directory is missing"
        else:
            try: validate_mapping(item)
            except ValueError as exc:
                status, issue = ("query-failed" if "query failed" in str(exc).lower() else "mismatched"), str(exc)
        results.append({"label": item["label"], "status": status, **({"issue": issue} if issue else {})})
    return {"version": VERSION, "id": record["id"], "state": record["state"], "recordPath": str(path), "repositories": results}


def set_state(args: argparse.Namespace) -> dict:
    if args.state not in {"awaiting-merge", "cleanup-pending"}: fail("State must be awaiting-merge or cleanup-pending; verified and failure states are set by their owning operations")
    path = absolute(args.record, "record")
    with locked(path):
        record = load(path)
        record["state"] = args.state
        record["issue"] = (args.reason[:MAX_TEXT] if args.reason else None)
        for item in record["repositories"]:
            if item["state"] != "cleaned": item["state"] = args.state
        save(path, record)
    return record


def same_artifact(source: Path, destination: Path) -> bool:
    if source.is_symlink() or destination.is_symlink():
        return source.is_symlink() and destination.is_symlink() and os.readlink(source) == os.readlink(destination)
    if source.is_file() and destination.is_file(): return filecmp.cmp(source, destination, shallow=False)
    if source.is_dir() and destination.is_dir():
        comparison = filecmp.dircmp(source, destination)
        return not (comparison.left_only or comparison.diff_files or comparison.funny_files) and all(same_artifact(source / name, destination / name) for name in comparison.common_dirs)
    return False


def dispositions(raw: str | None, record: dict) -> list[dict]:
    if raw is None: fail("--artifact-dispositions is required")
    try: items = json.loads(raw)
    except json.JSONDecodeError as exc: fail(f"Invalid artifact dispositions: {exc}")
    if not isinstance(items, list) or len(items) > MAX_DECISIONS: fail("Artifact dispositions must be a bounded JSON list")
    labels = {item["label"] for item in record["repositories"]}
    normalized = []
    for item in items:
        if not isinstance(item, dict) or item.get("repository") not in labels or item.get("action") not in {"dispose", "preserve"}:
            fail("Each artifact disposition needs a repository, relative path, and dispose/preserve action")
        relative = item.get("path")
        parts = Path(relative).parts if isinstance(relative, str) else ()
        if not isinstance(relative, str) or not relative or Path(relative) == Path(".") or len(relative) > 1024 or Path(relative).is_absolute() or ".." in parts or any(part.lower() == ".git" for part in parts):
            fail("Artifact disposition path must be a bounded source-relative path outside Git metadata")
        decision = {"repository": item["repository"], "path": relative, "action": item["action"]}
        if item["action"] == "preserve":
            destination = item.get("destination")
            if not isinstance(destination, str) or len(destination) > 4096:
                fail("Preservation disposition needs a bounded absolute destination")
            decision["destination"] = str(absolute(destination, "preservation destination"))
        normalized.append(decision)
    return normalized


def safe_artifact_path(worktree: Path, relative: str) -> Path:
    root = worktree.resolve()
    current = root
    parts = Path(relative).parts
    for part in parts[:-1]:
        current = current / part
        if current.is_symlink(): fail(f"Artifact path has a symlink parent: {relative}")
        if current.exists() and not current.is_dir(): fail(f"Artifact path parent is not a directory: {relative}")
    candidate = current / parts[-1]
    if candidate.parent.resolve() != current.resolve() or not current.resolve().is_relative_to(root):
        fail(f"Artifact path escapes the worktree: {relative}")
    return candidate


def local_artifacts(worktree: Path) -> list[str]:
    result = git(worktree, "status", "--porcelain=v1", "-z", "--untracked-files=normal", "--ignored=matching")
    artifacts = []
    for entry in result.stdout.split("\0"):
        if not entry.startswith(("?? ", "!! ")): continue
        relative = entry[3:]
        if not relative: continue
        if len(artifacts) >= MAX_DECISIONS: fail(f"Too many local artifacts in {worktree}; inventory them in smaller groups")
        if len(relative) > 1024: fail(f"Local artifact path is too long in {worktree}")
        safe_artifact_path(worktree, relative)
        artifacts.append(relative)
    return artifacts


def ticket_plan_file(feature_text: str, ticket: str) -> str | None:
    active = False
    for line in feature_text.splitlines():
        match = re.match(r"^-\s+id:\s*['\"]?([^'\"\s]+)['\"]?\s*$", line)
        if match:
            active = match.group(1).lower() == ticket.lower()
            continue
        if active:
            plan = re.match(r"^\s{2}plan_file:\s*(.*?)\s*$", line)
            if plan:
                value = plan.group(1).strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"": value = value[1:-1]
                return value or None
    return None


def verify_surviving_handoff(record: dict, authored_value: str, plan_file: str) -> tuple[Path, Path]:
    authored = absolute(authored_value, "authored root")
    primary = next(item for item in record["repositories"] if item["role"] == "primary")
    if authored != Path(primary["source"]): fail("Authored root must be the surviving primary source checkout")
    relative_plan = Path(plan_file)
    if relative_plan.is_absolute() or ".." in relative_plan.parts: fail("Surviving authored plan path must be source-relative")
    candidate = (authored / relative_plan).resolve()
    if not candidate.is_relative_to(authored): fail("Surviving authored plan must remain inside the authored root")
    if not candidate.is_file(): fail("Surviving authored plan does not exist")
    features = authored / "agent-work/features.yaml"
    try: feature_text = features.read_text()
    except OSError: fail("Surviving canonical ticket file does not exist")
    recorded_plan = ticket_plan_file(feature_text, record["ticket"])
    if recorded_plan is None: fail("Surviving canonical ticket or its plan_file is missing")
    if recorded_plan != plan_file: fail("Surviving canonical ticket plan_file does not match the approved archived plan")
    return authored, candidate


def remove(args: argparse.Namespace) -> dict:
    if args.outcome not in {"merged", "discarded"}: fail("Closeout outcome must be merged or discarded")
    path = absolute(args.record, "record")
    preflight_record = load(path)
    validate_record_location(path, preflight_record["repositories"])
    with locked(path):
        record = load(path)
        validate_record_location(path, record["repositories"])
        existing_outcome = record.get("terminalOutcome")
        if existing_outcome is not None and existing_outcome != args.outcome:
            fail(f"Closeout outcome is already {existing_outcome} and cannot change to {args.outcome}")
        decisions = dispositions(args.artifact_dispositions, record)
        cleaned_labels = {item["label"] for item in record["repositories"] if item["state"] == "cleaned"}
        if any(item["repository"] in cleaned_labels for item in decisions):
            fail("Artifact dispositions for an already-cleaned repository cannot be replaced")
        retained = [item for item in record.get("artifactDispositions", []) if item.get("repository") in cleaned_labels]
        merged_decisions = retained + decisions
        by_repo = {item["label"]: [] for item in record["repositories"]}
        for decision in decisions: by_repo[decision["repository"]].append(decision)
        record["artifactDispositions"] = merged_decisions
        record["state"] = "cleanup-pending"
        record["terminalOutcome"] = existing_outcome or args.outcome
        record["issue"] = None
        for repo in record["repositories"]:
            if repo["state"] != "cleaned":
                repo["state"] = "cleanup-pending"
                repo["issue"] = None
        save(path, record)
        try:
            authored, _plan = verify_surviving_handoff(record, args.authored_root, args.plan_file)
        except ValueError as exc:
            record["issue"] = str(exc)[:MAX_TEXT]
            for repo in record["repositories"]:
                if repo["state"] != "cleaned":
                    repo["state"] = "check-needed"
                    repo["issue"] = record["issue"]
            save(path, record)
            raise
        for repo in record["repositories"]:
            if repo["state"] == "cleaned": continue
            worktree = Path(repo["worktree"])
            try:
                validate_mapping(repo)
                tracked = git(worktree, "status", "--porcelain", "--untracked-files=no").stdout
                if tracked: fail(f"Tracked changes remain in {repo['label']}")
                artifacts = local_artifacts(worktree)
                artifact_roots = {name.rstrip("/") for name in artifacts}
                decided = {item["path"].rstrip("/") for item in by_repo[repo["label"]]}
                unknown = sorted(decided - artifact_roots)
                if unknown: fail(f"Disposition does not match a local artifact root in {repo['label']}: {', '.join(unknown[:10])}")
                unresolved = sorted(artifact_roots - decided)
                if unresolved: fail(f"Unresolved local artifacts in {repo['label']}: {', '.join(unresolved[:10])}")
                for decision in by_repo[repo["label"]]:
                    source = safe_artifact_path(worktree, decision["path"])
                    if git(worktree, "ls-files", "-z", "--", decision["path"]).stdout:
                        fail(f"Disposition includes a tracked path in {repo['label']}: {decision['path']}")
                    if not source.exists() and not source.is_symlink(): fail(f"Declared artifact does not exist: {decision['path']}")
                    if decision["action"] == "preserve":
                        destination = absolute(decision.get("destination", ""), "preservation destination")
                        if destination == worktree or destination.is_relative_to(worktree): fail("Preservation destination must be outside the worktree")
                        if not same_artifact(source, destination): fail(f"Preserved artifact is not verified: {decision['path']}")
                # Remove only the exact, pre-authorized artifacts. This lets ordinary
                # git worktree removal stay strict without using --force.
                for decision in by_repo[repo["label"]]:
                    artifact = safe_artifact_path(worktree, decision["path"])
                    if artifact.is_dir() and not artifact.is_symlink(): shutil.rmtree(artifact)
                    else: artifact.unlink()
                git(Path(repo["source"]), "worktree", "remove", str(worktree))
                if worktree.exists() or worktree in membership(Path(repo["source"])): fail(f"Worktree removal was not verified for {repo['label']}")
                repo.update(state="cleaned", outcome=args.outcome, verifiedAt=now(), issue=None)
                save(path, record)
            except Exception as exc:
                repo["state"] = "check-needed"
                repo["issue"] = str(exc)[:MAX_TEXT]
                record["state"] = "check-needed"
                record["issue"] = repo["issue"]
                save(path, record)
                raise
        record["archivedPlanFile"] = args.plan_file
        record.update(authoredRoot=str(authored), state="cleaned", verifiedAt=now(), issue=None)
        save(path, record)
    return record


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    subs = result.add_subparsers(dest="command", required=True)
    for name in ("create", "register"):
        item = subs.add_parser(name)
        item.add_argument("--ticket", required=True); item.add_argument("--root"); item.add_argument("--repo", action="append", required=True); item.add_argument("--hub-owned", action="store_true", help="Refuse a mapping known to be Hub-owned")
        item.set_defaults(run=create if name == "create" else register)
    item = subs.add_parser("inspect", aliases=["verify"]); item.add_argument("--record", required=True); item.set_defaults(run=inspect_record)
    item = subs.add_parser("state"); item.add_argument("--record", required=True); item.add_argument("--state", required=True); item.add_argument("--reason"); item.set_defaults(run=set_state)
    item = subs.add_parser("remove"); item.add_argument("--record", required=True); item.add_argument("--outcome", required=True); item.add_argument("--artifact-dispositions"); item.add_argument("--authored-root", required=True); item.add_argument("--plan-file", required=True); item.set_defaults(run=remove)
    return result


def main() -> int:
    try:
        args = parser().parse_args()
        print(json.dumps(args.run(args), sort_keys=True))
        return 0
    except (ValueError, OSError) as exc:
        print(f"worktrees: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__": raise SystemExit(main())
