#!/usr/bin/env python3

import importlib.machinery
import importlib.util
import json
import sys
from datetime import datetime
from pathlib import Path

import yaml

pv_path = Path(__file__).parent.parent / "bin" / "pv"
loader = importlib.machinery.SourceFileLoader("pv", str(pv_path))
spec = importlib.util.spec_from_loader("pv", loader)
pv = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = pv
loader.exec_module(pv)


def make_model() -> pv.Model:
    return pv.Model(features={}, epics={}, activity={})


def write_features(tmp_path: Path, features: list[dict]) -> pv.ProjectSummary:
    features_path = tmp_path / "features.yaml"
    with features_path.open("w") as f:
        json.dump(features, f)

    project = pv.ProjectSummary(path=str(tmp_path), name=tmp_path.name)
    project._detail = pv.Model.load(str(features_path))
    return project


def test_op_create_feature_creates_feature_with_next_id():
    model = make_model()
    model.features["auth-001"] = pv.Feature(id="auth-001", epic="auth", status="done", title="Existing")
    model.epics["auth"] = pv.Epic(name="auth", features=[model.features["auth-001"]])

    feature = pv.op_create_feature(
        model,
        "auth",
        {
            "title": "Password reset",
            "status": "pending",
            "priority": 1,
            "depends_on": ["auth-001"],
        },
    )

    assert feature.id == "auth-002"
    assert feature.title == "Password reset"
    assert feature.status == "pending"
    assert feature.priority == 1
    assert feature.depends_on == ["auth-001"]
    assert feature.created_at == datetime.now().strftime("%Y-%m-%d")
    assert model.features[feature.id] is feature
    assert model.epics["auth"].features[-1] is feature


def test_op_create_epic_rejects_duplicate_name():
    model = make_model()
    pv.op_create_epic(model, "payments")

    assert "payments" in model.epics

    try:
        pv.op_create_epic(model, "payments")
        assert False, "expected duplicate epic creation to fail"
    except ValueError as exc:
        assert "already exists" in str(exc)


def test_handle_creation_input_commits_fields_and_cycles_status(tmp_path: Path):
    project = write_features(tmp_path, [])
    state = pv.State(view="creation", current_project=project)
    state.creation = pv.CreationState(entity_type="feature", epic_context="auth", return_view="epic")
    state.edit = pv.EditState(mode="edit", field_idx=0, editing_value="")

    for char in "Hello":
        state = pv.handle_creation_input(char, state)
    assert state.edit.editing_value == "Hello"

    state = pv.handle_creation_input("\t", state)
    assert state.creation.fields["title"] == "Hello"
    assert state.edit.field_idx == 1
    assert state.edit.editing_value == "pending"

    state = pv.handle_creation_input("j", state)
    assert state.edit.editing_value == "in_progress"
    state = pv.handle_creation_input("k", state)
    assert state.edit.editing_value == "pending"

    state = pv.handle_creation_input("\x1b", state)
    assert state.creation.preview_mode is True


def test_commit_creation_feature_updates_model_and_writes_file(tmp_path: Path):
    project = write_features(
        tmp_path,
        [{"id": "auth-001", "epic": "auth", "status": "done", "title": "Existing", "created_at": "2024-01-01"}],
    )

    state = pv.State(view="creation", current_project=project)
    state.creation = pv.CreationState(
        entity_type="feature",
        epic_context="auth",
        fields={
            "title": "New feature",
            "status": "pending",
            "priority": 2,
            "description": "Created in test",
            "depends_on": ["auth-001"],
        },
        return_view="epic",
    )

    pv.commit_creation(state)

    assert state.creation is None
    assert state.view == "feature"
    assert state.current_feature == "auth-002"
    assert state.flash_message == "Created auth-002"
    assert "auth-002" in project._detail.features

    saved = yaml.safe_load((tmp_path / "features.yaml").read_text())
    assert [item["id"] for item in saved] == ["auth-001", "auth-002"]
    assert saved[1]["depends_on"] == ["auth-001"]
    assert saved[1]["priority"] == 2


def test_preview_helpers_match_creation_shape():
    feature = pv.op_preview_feature("auth", {"title": "Test", "priority": 2})
    epic = pv.op_preview_epic("payments")

    assert feature["id"] == "auth-???"
    assert feature["title"] == "Test"
    assert feature["priority"] == 2
    assert feature["status"] == "pending"
    assert epic == {"name": "payments", "features": []}
