import json
import os
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

HELPER = Path(__file__).parents[1] / "skills/_lib/worktrees.py"


def git(cwd, *args, check=True):
    return subprocess.run(["git", "-C", str(cwd), *args], text=True, capture_output=True, check=check)


def repo(tmp_path, name="source"):
    root = tmp_path / name
    root.mkdir()
    git(root, "init", "-b", "main")
    git(root, "config", "user.email", "test@example.com")
    git(root, "config", "user.name", "Test")
    (root / "README").write_text("start\n")
    git(root, "add", "README")
    git(root, "commit", "-m", "start")
    return root


def workflow(repo_path, ticket):
    (repo_path / "agent-work/history").mkdir(parents=True)
    plan = f"agent-work/history/{ticket}.md"
    (repo_path / plan).write_text("# Complete\n")
    (repo_path / "agent-work/features.yaml").write_text(f"- id: {ticket}\n  plan_file: {plan}\n")
    git(repo_path, "add", "agent-work")
    git(repo_path, "commit", "-m", "add workflow")
    return plan


def run(*args, env=None, check=True):
    result = subprocess.run([sys.executable, str(HELPER), *map(str, args)], text=True, capture_output=True, env=env)
    if check and result.returncode:
        raise AssertionError(result.stderr)
    return result


def spec(**value):
    return json.dumps(value)


def test_create_uses_external_unique_task_paths_and_inspects(tmp_path):
    source = repo(tmp_path)
    storage = tmp_path / "worktrees"
    env = {**os.environ, "AGENT_WORKTREES_DIR": str(storage)}
    item = spec(label="app", source=str(source), branch="task-a", base="main", target="main", role="primary")
    first = json.loads(run("create", "--ticket", "same-001", "--repo", item, env=env).stdout)
    second_item = spec(label="app", source=str(source), branch="task-b", base="main", target="main", role="primary")
    second = json.loads(run("create", "--ticket", "same-001", "--repo", second_item, env=env).stdout)
    assert first["recordPath"] != second["recordPath"]
    record = json.loads(Path(first["recordPath"]).read_text())
    assert record["repositories"][0]["worktree"].startswith(str(storage))
    assert record["authoredRoot"] == record["repositories"][0]["worktree"]
    inspected = json.loads(run("inspect", "--record", first["recordPath"]).stdout)
    assert inspected["repositories"][0]["status"] == "valid"


def test_create_record_root_must_be_external_to_source(tmp_path):
    source = repo(tmp_path)
    result = run("create", "--ticket", "nested-001", "--root", source / "records",
        "--repo", spec(label="app", source=str(source), branch="nested-task", base="main", target="main", role="primary"), check=False)
    assert result.returncode
    assert "root" in result.stderr.lower() and "source" in result.stderr.lower()
    assert not (source / "records").exists()
    assert "nested-task" not in git(source, "branch", "--list").stdout


def test_record_root_must_be_external_even_for_nested_registration(tmp_path):
    source = repo(tmp_path)
    nested = source / "legacy"
    git(source, "worktree", "add", "-b", "legacy-task", str(nested), "main")
    result = run("register", "--ticket", "legacy-001", "--root", source / "records",
        "--repo", spec(label="app", source=str(source), worktree=str(nested), branch="legacy-task", target="main", role="primary"), check=False)
    assert result.returncode
    assert "root" in result.stderr.lower() and "source" in result.stderr.lower()
    assert nested.exists()


def test_create_and_register_require_canonical_repository_roots(tmp_path):
    source = repo(tmp_path)
    (source / "subdir").mkdir()
    create_result = run("create", "--ticket", "roots-001", "--root", tmp_path / "records",
        "--repo", spec(label="app", source=str(source / "subdir"), branch="roots-task", base="main", target="main", role="primary"), check=False)
    assert create_result.returncode and "top-level" in create_result.stderr.lower()

    linked = tmp_path / "linked"
    git(source, "worktree", "add", "-b", "linked-task", str(linked), "main")
    (linked / "subdir").mkdir()
    register_result = run("register", "--ticket", "roots-001", "--root", tmp_path / "records",
        "--repo", spec(label="app", source=str(linked / "subdir"), worktree=str(linked), branch="linked-task", target="main", role="primary"), check=False)
    assert register_result.returncode and "top-level" in register_result.stderr.lower()
    assert linked.exists()


def test_create_rejects_sources_from_same_git_common_directory(tmp_path):
    source = repo(tmp_path)
    linked_source = tmp_path / "linked-source"
    git(source, "worktree", "add", "-b", "linked", str(linked_source), "main")
    result = run("create", "--ticket", "identity-001", "--root", tmp_path / "records",
        "--repo", spec(label="one", source=str(source), branch="one-task", base="main", target="main", role="primary"),
        "--repo", spec(label="two", source=str(linked_source), branch="two-task", base="linked", target="main", role="additional"), check=False)
    assert result.returncode and "common" in result.stderr.lower()


def test_register_rejects_source_as_worktree(tmp_path):
    source = repo(tmp_path)
    result = run("register", "--ticket", "identity-001", "--root", tmp_path / "records",
        "--repo", spec(label="app", source=str(source), worktree=str(source), branch="main", target="main", role="primary"), check=False)
    assert result.returncode and "source" in result.stderr.lower() and "worktree" in result.stderr.lower()


def test_create_and_register_reject_duplicate_repository_identities(tmp_path):
    source = repo(tmp_path)
    duplicate_create = run("create", "--ticket", "duplicate-001", "--root", tmp_path / "records",
        "--repo", spec(label="one", source=str(source), branch="one-task", base="main", target="main", role="primary"),
        "--repo", spec(label="two", source=str(source), branch="two-task", base="main", target="main", role="additional"), check=False)
    assert duplicate_create.returncode and "duplicate" in duplicate_create.stderr.lower()

    nested = source / "legacy"
    git(source, "worktree", "add", "-b", "legacy-task", str(nested), "main")
    duplicate_register = run("register", "--ticket", "duplicate-001", "--root", tmp_path / "records",
        "--repo", spec(label="one", source=str(source), worktree=str(nested), branch="legacy-task", target="main", role="primary"),
        "--repo", spec(label="two", source=str(source), worktree=str(nested), branch="legacy-task", target="main", role="additional"), check=False)
    assert duplicate_register.returncode and "duplicate" in duplicate_register.stderr.lower()


def test_register_rejects_durable_record_inside_registered_worktree(tmp_path):
    source = repo(tmp_path)
    worktree = tmp_path / "registered"
    git(source, "worktree", "add", "-b", "registered-task", str(worktree), "main")
    create_result = run("create", "--ticket", "record-001", "--root", worktree / "create-records",
        "--repo", spec(label="app", source=str(source), branch="new-task", base="main", target="main", role="primary"), check=False)
    assert create_result.returncode and "record" in create_result.stderr.lower() and "worktree" in create_result.stderr.lower()
    assert not (worktree / "create-records").exists()

    result = run("register", "--ticket", "record-001", "--root", worktree / "records",
        "--repo", spec(label="app", source=str(source), worktree=str(worktree), branch="registered-task", target="main", role="primary"), check=False)
    assert result.returncode and "record" in result.stderr.lower() and "worktree" in result.stderr.lower()
    assert worktree.exists()
    assert not (worktree / "records").exists()
    assert f"worktree {worktree}" in git(source, "worktree", "list", "--porcelain").stdout


def test_register_preserves_explicit_nested_worktree_and_rejects_mismatch(tmp_path):
    source = repo(tmp_path)
    nested = source / "legacy"
    git(source, "worktree", "add", "-b", "legacy-task", str(nested), "main")
    record = json.loads(run("register", "--ticket", "legacy-001", "--root", tmp_path / "records",
        "--repo", spec(label="app", source=str(source), worktree=str(nested), branch="legacy-task", target="main", role="primary")).stdout)
    assert json.loads(Path(record["recordPath"]).read_text())["authoredRoot"] == str(nested.resolve())
    bad = run("register", "--ticket", "legacy-001", "--root", tmp_path / "records",
        "--repo", spec(label="app", source=str(source), worktree=str(nested), branch="wrong", target="main", role="primary"), check=False)
    assert bad.returncode and "branch" in bad.stderr.lower()


def test_create_failure_marks_every_uncreated_mapping_check_needed(tmp_path):
    first = repo(tmp_path, "first")
    second = repo(tmp_path, "second")
    root = tmp_path / "records"
    result = run("create", "--ticket", "failure-001", "--root", root,
        "--repo", spec(label="first", source=str(first), branch="main", base="main", target="main", role="primary"),
        "--repo", spec(label="second", source=str(second), branch="second-task", base="main", target="main", role="additional"), check=False)
    assert result.returncode
    records = list(root.glob("failure-001-*/worktree.json"))
    assert len(records) == 1
    record = json.loads(records[0].read_text())
    assert record["state"] == "check-needed"
    assert {item["state"] for item in record["repositories"]} == {"check-needed"}
    assert all(item["issue"] for item in record["repositories"])


def test_remove_requires_dispositions_and_verifies_preservation(tmp_path):
    source = repo(tmp_path)
    root = tmp_path / "records"
    plan = workflow(source, "clean-001")
    created = json.loads(run("create", "--ticket", "clean-001", "--root", root,
        "--repo", spec(label="app", source=str(source), branch="clean-task", base="main", target="main", role="primary")).stdout)
    record_path = Path(created["recordPath"])
    worktree = Path(json.loads(record_path.read_text())["authoredRoot"])
    (worktree / "local.txt").write_text("keep\n")
    missing = run("remove", "--record", record_path, "--outcome", "discarded", check=False)
    assert missing.returncode and "artifact" in missing.stderr.lower()
    preserved = tmp_path / "saved.txt"
    preserved.write_text("keep\n")
    decisions = json.dumps([{"repository":"app","path":"local.txt","action":"preserve","destination":str(preserved)}])
    done = json.loads(run("remove", "--record", record_path, "--outcome", "discarded", "--artifact-dispositions", decisions,
        "--authored-root", str(source), "--plan-file", plan).stdout)
    assert done["state"] == "cleaned"
    assert record_path.exists() and not worktree.exists()
    assert done["authoredRoot"] == str(source.resolve())
    inspected = json.loads(run("inspect", "--record", record_path).stdout)
    assert inspected["repositories"] == [{"label": "app", "status": "cleaned"}]

    worktree.mkdir()
    mismatched = json.loads(run("verify", "--record", record_path).stdout)
    assert mismatched["repositories"][0]["status"] == "mismatched"
    worktree.rmdir()

    git(source, "worktree", "add", str(worktree), "clean-task")
    shutil.rmtree(worktree)
    registered = json.loads(run("inspect", "--record", record_path).stdout)
    assert registered["repositories"][0]["status"] == "mismatched"
    assert "registration" in registered["repositories"][0]["issue"]
    git(source, "worktree", "prune")
    source.rename(tmp_path / "moved-source")
    failed = json.loads(run("inspect", "--record", record_path).stdout)
    assert failed["repositories"][0]["status"] == "query-failed"


def test_remove_verifies_surviving_handoff_before_artifact_or_worktree_deletion(tmp_path):
    source = repo(tmp_path)
    plan = workflow(source, "handoff-001")
    made = json.loads(run("create", "--ticket", "handoff-001", "--root", tmp_path / "records",
        "--repo", spec(label="app", source=str(source), branch="handoff-task", base="main", target="main", role="primary")).stdout)
    path = Path(made["recordPath"])
    worktree = Path(json.loads(path.read_text())["authoredRoot"])
    artifact = worktree / "local.txt"
    artifact.write_text("discard only after preflight\n")
    result = run("remove", "--record", path, "--outcome", "discarded",
        "--artifact-dispositions", json.dumps([{"repository": "app", "path": "local.txt", "action": "dispose"}]),
        "--authored-root", source, "--plan-file", "agent-work/history/missing.md", check=False)
    assert result.returncode and "plan" in result.stderr.lower()
    assert worktree.exists() and artifact.exists()
    assert f"worktree {worktree}" in git(source, "worktree", "list", "--porcelain").stdout
    record = json.loads(path.read_text())
    assert record["authoredRoot"] == str(worktree)
    assert record["state"] == "cleanup-pending"
    assert record["repositories"][0]["state"] == "check-needed"
    assert "plan" in record["repositories"][0]["issue"].lower()
    assert (source / plan).exists()


def test_remove_requires_ticket_pointer_to_approved_surviving_plan(tmp_path):
    source = repo(tmp_path)
    canonical = workflow(source, "pointer-001")
    alternate = source / "agent-work/history/alternate.md"
    alternate.write_text("# Alternate\n")
    made = json.loads(run("create", "--ticket", "pointer-001", "--root", tmp_path / "records",
        "--repo", spec(label="app", source=str(source), branch="pointer-task", base="main", target="main", role="primary")).stdout)
    path = Path(made["recordPath"])
    worktree = Path(json.loads(path.read_text())["authoredRoot"])
    result = run("remove", "--record", path, "--outcome", "merged", "--artifact-dispositions", "[]",
        "--authored-root", source, "--plan-file", "agent-work/history/alternate.md", check=False)
    assert result.returncode and "plan_file" in result.stderr
    assert worktree.exists()
    assert (source / canonical).exists()


def test_remove_rejects_root_git_and_symlink_parent_artifact_paths(tmp_path):
    source = repo(tmp_path)
    plan = workflow(source, "paths-001")
    made = json.loads(run("create", "--ticket", "paths-001", "--root", tmp_path / "records",
        "--repo", spec(label="app", source=str(source), branch="paths-task", base="main", target="main", role="primary")).stdout)
    path = Path(made["recordPath"])
    worktree = Path(json.loads(path.read_text())["authoredRoot"])
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "important.txt").write_text("keep\n")
    (worktree / "escape").symlink_to(outside, target_is_directory=True)

    for relative in [".", "./", ".git", ".git/config", "escape/important.txt"]:
        decisions = [{"repository": "app", "path": relative, "action": "dispose"}]
        if relative.startswith("escape/"):
            decisions.insert(0, {"repository": "app", "path": "escape", "action": "dispose"})
        result = run("remove", "--record", path, "--outcome", "discarded",
            "--artifact-dispositions", json.dumps(decisions),
            "--authored-root", source, "--plan-file", plan, check=False)
        assert result.returncode, relative
        if relative.startswith("escape/"): assert "local artifact root" in result.stderr.lower()
        assert worktree.exists() and (outside / "important.txt").exists()

    # A symlink leaf is safe to unlink because its parent remains inside the worktree.
    done = json.loads(run("remove", "--record", path, "--outcome", "discarded",
        "--artifact-dispositions", json.dumps([{"repository": "app", "path": "escape", "action": "dispose"}]),
        "--authored-root", source, "--plan-file", plan).stdout)
    assert done["state"] == "cleaned"
    assert (outside / "important.txt").exists()


def test_remove_rejects_record_relocated_inside_worktree(tmp_path):
    source = repo(tmp_path)
    plan = workflow(source, "record-guard-001")
    made = json.loads(run("create", "--ticket", "record-guard-001", "--root", tmp_path / "records",
        "--repo", spec(label="app", source=str(source), branch="record-guard-task", base="main", target="main", role="primary")).stdout)
    original_path = Path(made["recordPath"])
    record = json.loads(original_path.read_text())
    worktree = Path(record["authoredRoot"])
    unsafe_path = worktree / "record" / "worktree.json"
    unsafe_path.parent.mkdir()
    record["recordPath"] = str(unsafe_path)
    unsafe_path.write_text(json.dumps(record))

    result = run("remove", "--record", unsafe_path, "--outcome", "discarded", "--artifact-dispositions", "[]",
        "--authored-root", source, "--plan-file", plan, check=False)
    assert result.returncode and "record" in result.stderr.lower() and "worktree" in result.stderr.lower()
    assert worktree.exists() and unsafe_path.exists()
    persisted = json.loads(unsafe_path.read_text())
    assert persisted["state"] == "active"


def test_remove_revalidates_canonical_source_before_any_deletion(tmp_path):
    source = repo(tmp_path)
    plan = workflow(source, "revalidate-001")
    made = json.loads(run("create", "--ticket", "revalidate-001", "--root", tmp_path / "records",
        "--repo", spec(label="app", source=str(source), branch="revalidate-task", base="main", target="main", role="primary")).stdout)
    path = Path(made["recordPath"])
    record = json.loads(path.read_text())
    worktree = Path(record["authoredRoot"])
    artifact = worktree / "local.txt"
    artifact.write_text("keep\n")

    nested_source = source / "nested-source"
    nested_source.mkdir()
    shutil.copytree(source / "agent-work", nested_source / "agent-work")
    record["repositories"][0]["source"] = str(nested_source)
    path.write_text(json.dumps(record))
    refused = run("remove", "--record", path, "--outcome", "discarded",
        "--artifact-dispositions", json.dumps([{"repository": "app", "path": "local.txt", "action": "dispose"}]),
        "--authored-root", nested_source, "--plan-file", plan, check=False)
    assert refused.returncode and "top-level" in refused.stderr.lower()
    assert worktree.exists() and artifact.read_text() == "keep\n"


def test_remove_refuses_disposition_for_clean_tracked_path_without_deleting_it(tmp_path):
    source = repo(tmp_path)
    plan = workflow(source, "tracked-001")
    made = json.loads(run("create", "--ticket", "tracked-001", "--root", tmp_path / "records",
        "--repo", spec(label="app", source=str(source), branch="tracked-task", base="main", target="main", role="primary")).stdout)
    path = Path(made["recordPath"])
    worktree = Path(json.loads(path.read_text())["authoredRoot"])
    original = (worktree / "README").read_text()
    refused = run("remove", "--record", path, "--outcome", "discarded",
        "--artifact-dispositions", json.dumps([{"repository": "app", "path": "README", "action": "dispose"}]),
        "--authored-root", source, "--plan-file", plan, check=False)
    assert refused.returncode and "local artifact" in refused.stderr.lower()
    assert worktree.exists()
    assert (worktree / "README").read_text() == original
    assert not git(worktree, "status", "--porcelain").stdout


def test_remove_requires_disposition_for_ignored_artifacts(tmp_path):
    source = repo(tmp_path)
    (source / ".gitignore").write_text("cache/\n")
    git(source, "add", ".gitignore")
    git(source, "commit", "-m", "ignore cache")
    plan = workflow(source, "ignored-001")
    made = json.loads(run("create", "--ticket", "ignored-001", "--root", tmp_path / "records",
        "--repo", spec(label="app", source=str(source), branch="ignored-task", base="main", target="main", role="primary")).stdout)
    path = Path(made["recordPath"])
    worktree = Path(json.loads(path.read_text())["authoredRoot"])
    (worktree / "cache").mkdir()
    (worktree / "cache/output.bin").write_bytes(b"useful")

    refused = run("remove", "--record", path, "--outcome", "discarded", "--artifact-dispositions", "[]",
        "--authored-root", source, "--plan-file", plan, check=False)
    assert refused.returncode and "cache" in refused.stderr
    assert worktree.exists() and (worktree / "cache/output.bin").exists()

    done = json.loads(run("remove", "--record", path, "--outcome", "discarded",
        "--artifact-dispositions", json.dumps([{"repository": "app", "path": "cache", "action": "dispose"}]),
        "--authored-root", source, "--plan-file", plan).stdout)
    assert done["state"] == "cleaned"


def test_remove_refuses_unresolved_changes_and_generic_state_cannot_clean(tmp_path):
    source = repo(tmp_path)
    plan = workflow(source, "dirty-001")
    made = json.loads(run("create", "--ticket", "dirty-001", "--root", tmp_path / "records",
        "--repo", spec(label="app", source=str(source), branch="dirty-task", base="main", target="main", role="primary")).stdout)
    path = Path(made["recordPath"])
    worktree = Path(json.loads(path.read_text())["authoredRoot"])
    (worktree / "README").write_text("changed\n")
    refused = run("remove", "--record", path, "--outcome", "discarded", "--artifact-dispositions", "[]", "--authored-root", source, "--plan-file", plan, check=False)
    assert refused.returncode and "tracked" in refused.stderr.lower()
    clean = run("state", "--record", path, "--state", "cleaned", check=False)
    assert clean.returncode


def test_concurrent_state_updates_keep_atomic_valid_record(tmp_path):
    source = repo(tmp_path)
    made = json.loads(run("create", "--ticket", "lock-001", "--root", tmp_path / "records",
        "--repo", spec(label="app", source=str(source), branch="lock-task", base="main", target="main", role="primary")).stdout)
    path = Path(made["recordPath"])
    before = json.loads(path.read_text())["revision"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda state: run("state", "--record", path, "--state", state), ["awaiting-merge", "cleanup-pending"]))
    assert all(result.returncode == 0 for result in results)
    record = json.loads(path.read_text())
    assert record["revision"] == before + 2
    assert record["state"] in {"awaiting-merge", "cleanup-pending"}


def test_multi_repo_removal_retains_partial_success(tmp_path):
    first = repo(tmp_path, "first")
    second = repo(tmp_path, "second")
    plan = workflow(first, "multi-001")
    made = json.loads(run("create", "--ticket", "multi-001", "--root", tmp_path / "records",
        "--repo", spec(label="first", source=str(first), branch="multi-first", base="main", target="main", role="primary"),
        "--repo", spec(label="second", source=str(second), branch="multi-second", base="main", target="main", role="additional")).stdout)
    path = Path(made["recordPath"])
    record = json.loads(path.read_text())
    first_worktree = Path(next(item for item in record["repositories"] if item["label"] == "first")["worktree"])
    second_worktree = Path(next(item for item in record["repositories"] if item["label"] == "second")["worktree"])
    (first_worktree / "first.txt").write_text("dispose first\n")
    (second_worktree / "README").write_text("dirty\n")
    first_decision = {"repository": "first", "path": "first.txt", "action": "dispose"}
    result = run("remove", "--record", path, "--outcome", "discarded", "--artifact-dispositions", json.dumps([first_decision]), "--authored-root", first, "--plan-file", plan, check=False)
    assert result.returncode
    after = json.loads(path.read_text())
    states = {item["label"]: item["state"] for item in after["repositories"]}
    assert states == {"first": "cleaned", "second": "check-needed"}
    assert after["artifactDispositions"] == [first_decision]
    assert not first_worktree.exists()
    assert second_worktree.exists()

    changed = run("remove", "--record", path, "--outcome", "merged", "--artifact-dispositions", "[]", "--authored-root", first, "--plan-file", plan, check=False)
    assert changed.returncode and "outcome" in changed.stderr.lower()
    unchanged = json.loads(path.read_text())
    assert unchanged["terminalOutcome"] == "discarded"
    assert unchanged["artifactDispositions"] == [first_decision]

    git(second_worktree, "checkout", "--", "README")
    (second_worktree / "second.txt").write_text("dispose second\n")
    second_decision = {"repository": "second", "path": "second.txt", "action": "dispose"}
    completed = json.loads(run("remove", "--record", path, "--outcome", "discarded",
        "--artifact-dispositions", json.dumps([second_decision]), "--authored-root", first, "--plan-file", plan).stdout)
    assert completed["state"] == "cleaned"
    assert completed["terminalOutcome"] == "discarded"
    assert completed["artifactDispositions"] == [first_decision, second_decision]
    assert not second_worktree.exists()
