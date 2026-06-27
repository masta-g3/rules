#!/usr/bin/env python3

import json
import subprocess
import tempfile
import unittest
from datetime import date
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parent.parent
HELPER = REPO_ROOT / "skills" / "_lib" / "features_yaml.sh"


class FeaturesYamlCliTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.workdir = Path(self.tempdir.name)
        self.features_file = self.workdir / "agent-work" / "features.yaml"

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def write_features(self, payload: list[dict]) -> None:
        self.features_file.parent.mkdir(parents=True, exist_ok=True)
        self.features_file.write_text(json.dumps(payload, indent=2))

    def run_helper(
        self,
        *args: str,
        expect_ok: bool = True,
        input_text: str | None = None,
    ) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            [str(HELPER), *args],
            cwd=self.workdir,
            text=True,
            input=input_text,
            capture_output=True,
            check=False,
        )
        if expect_ok and result.returncode != 0:
            self.fail(f"command failed: {args}\nstdout={result.stdout}\nstderr={result.stderr}")
        if not expect_ok and result.returncode == 0:
            self.fail(f"command unexpectedly succeeded: {args}\nstdout={result.stdout}")
        return result

    def test_epics_and_next_id_json(self) -> None:
        self.write_features(
            [
                {"id": "auth-001", "status": "pending"},
                {"id": "skill-006", "status": "pending"},
                {"id": "skill-009", "status": "pending"},
            ]
        )

        epics = self.run_helper("--file", str(self.features_file), "epics", "--output", "json")
        self.assertEqual(json.loads(epics.stdout), {"command": "epics", "epics": ["auth", "skill"]})

        next_id = self.run_helper(
            "--file",
            str(self.features_file),
            "next-id",
            "skill",
            "--output",
            "json",
        )
        self.assertEqual(
            json.loads(next_id.stdout),
            {"command": "next-id", "epic": "skill", "next_id": "skill-010"},
        )

    def test_next_prefers_in_progress_and_accepts_global_output(self) -> None:
        self.write_features(
            [
                {
                    "id": "skill-005",
                    "status": "pending",
                    "priority": 2,
                    "depends_on": [],
                    "description": "Pending work",
                },
                {
                    "id": "skill-006",
                    "status": "in_progress",
                    "priority": 1,
                    "depends_on": [],
                    "description": "Active work",
                },
            ]
        )

        result = self.run_helper(
            "--file",
            str(self.features_file),
            "--output",
            "id",
            "next",
            "--epic",
            "skill",
        )
        self.assertEqual(result.stdout.strip(), "skill-006")

    def test_default_next_uses_agent_work_features_file(self) -> None:
        self.write_features([
            {
                "id": "skill-001",
                "status": "pending",
                "priority": 1,
                "depends_on": [],
                "description": "Canonical backlog work",
            }
        ])

        result = self.run_helper("--output", "id", "next")
        self.assertEqual(result.stdout.strip(), "skill-001")

    def test_get_feature_outputs_full_feature_json(self) -> None:
        feature = {
            "id": "skill-006",
            "epic": "skill",
            "status": "pending",
            "title": "Simplify helper",
            "description": "Agent can inspect persisted fields",
            "priority": 2,
            "depends_on": ["skill-005"],
            "plan_file": "agent-work/plans/skill-006.md",
            "references": ["agent-work/tickets/cli-001/CLI_ASSESSMENT.md"],
        }
        self.write_features([feature])

        result = self.run_helper(
            "--file",
            str(self.features_file),
            "get",
            "skill-006",
            "--output",
            "json",
        )

        self.assertEqual(json.loads(result.stdout), {"command": "get", "feature": feature})

    def test_get_feature_text_is_human_usable(self) -> None:
        self.write_features([
            {
                "id": "skill-006",
                "status": "pending",
                "description": "Agent can inspect persisted fields",
                "priority": 2,
                "depends_on": ["skill-005"],
                "plan_file": "agent-work/plans/skill-006.md",
            }
        ])

        result = self.run_helper("--file", str(self.features_file), "get", "skill-006")

        self.assertIn("skill-006 [pending]", result.stdout)
        self.assertIn("priority: 2", result.stdout)
        self.assertIn("depends_on: skill-005", result.stdout)
        self.assertIn("plan_file: agent-work/plans/skill-006.md", result.stdout)
        self.assertIn("description: Agent can inspect persisted fields", result.stdout)

    def test_describe_feature_id_points_to_get(self) -> None:
        result = self.run_helper("describe", "skill-006", expect_ok=False)

        self.assertIn("describe expects one of", result.stderr)
        self.assertIn("get skill-006 --output json", result.stderr)

    def test_next_reports_blocked_items(self) -> None:
        self.write_features(
            [
                {
                    "id": "auth-002",
                    "status": "pending",
                    "priority": 2,
                    "depends_on": ["auth-001"],
                    "description": "Blocked work",
                }
            ]
        )

        result = self.run_helper("--file", str(self.features_file), "next")
        self.assertIn("BLOCKED", result.stdout)
        self.assertIn("auth-002 -> waiting on auth-001", result.stdout)

    def test_next_epic_filter_still_honors_done_dependencies_outside_epic(self) -> None:
        self.write_features(
            [
                {"id": "core-001", "status": "done"},
                {
                    "id": "skill-006",
                    "status": "pending",
                    "priority": 2,
                    "depends_on": ["core-001"],
                    "description": "Ready once cross-epic dependency is done",
                },
            ]
        )

        result = self.run_helper(
            "--file",
            str(self.features_file),
            "--output",
            "id",
            "next",
            "--epic",
            "skill",
        )
        self.assertEqual(result.stdout.strip(), "skill-006")

    def test_next_text_mode_handles_missing_features_file(self) -> None:
        result = self.run_helper("next")
        self.assertIn("No agent-work/features.yaml found", result.stdout)

        missing_id = self.run_helper("--output", "id", "next", expect_ok=False)
        self.assertEqual(missing_id.returncode, 1)

    def test_default_commands_do_not_fall_back_to_root_features_file(self) -> None:
        (self.workdir / "features.yaml").write_text(json.dumps([
            {"id": "skill-001", "status": "pending", "description": "Legacy root backlog"}
        ]))

        result = self.run_helper("next")
        self.assertIn("No agent-work/features.yaml found", result.stdout)

    def test_register_allocates_next_id_and_appends_feature(self) -> None:
        self.write_features(
            [
                {"id": "skill-001", "status": "pending"},
                {"id": "skill-003", "status": "pending"},
                {"id": "docs-010", "status": "pending"},
            ]
        )

        result = self.run_helper(
            "--file",
            str(self.features_file),
            "register",
            "--json",
            json.dumps(
                {
                    "epic": "skill",
                    "title": "Register tickets",
                    "description": "Agent can register tickets",
                }
            ),
            "--output",
            "json",
        )

        payload = json.loads(result.stdout)
        self.assertEqual(payload["command"], "register")
        self.assertTrue(payload["changed"])
        self.assertEqual(payload["feature"]["id"], "skill-004")
        features = yaml.safe_load(self.features_file.read_text())
        self.assertEqual(len(features), 4)
        self.assertEqual(
            features[-1],
            {
                "epic": "skill",
                "title": "Register tickets",
                "description": "Agent can register tickets",
                "id": "skill-004",
                "status": "pending",
                "created_at": date.today().isoformat(),
            },
        )

    def test_register_rejects_explicit_id_and_missing_epic(self) -> None:
        self.write_features([])

        explicit_id = self.run_helper(
            "--file",
            str(self.features_file),
            "register",
            "--json",
            json.dumps({"id": "skill-001", "epic": "skill"}),
            expect_ok=False,
        )
        self.assertIn("register payload must not include id", explicit_id.stderr)

        missing_epic = self.run_helper(
            "--file",
            str(self.features_file),
            "register",
            "--json",
            json.dumps({"title": "Missing epic"}),
            expect_ok=False,
        )
        self.assertIn("register payload must include string field: epic", missing_epic.stderr)

    def test_register_dry_run_does_not_mutate_file(self) -> None:
        self.write_features([])
        original = self.features_file.read_text()

        result = self.run_helper(
            "--file",
            str(self.features_file),
            "register",
            "--json",
            json.dumps({"epic": "skill", "title": "Dry run"}),
            "--dry-run",
            "--output",
            "json",
        )

        payload = json.loads(result.stdout)
        self.assertEqual(payload["command"], "register")
        self.assertTrue(payload["dry_run"])
        self.assertFalse(payload["changed"])
        self.assertEqual(payload["feature"]["id"], "skill-001")
        self.assertEqual(self.features_file.read_text(), original)

    def test_register_reads_json_from_stdin(self) -> None:
        self.write_features([])

        result = self.run_helper(
            "--file",
            str(self.features_file),
            "register",
            "--json",
            "-",
            "--output",
            "json",
            input_text=json.dumps({"epic": "skill", "title": "From stdin"}),
        )

        self.assertEqual(json.loads(result.stdout)["feature"]["id"], "skill-001")

    def test_create_then_update_plan_file_keeps_string_value(self) -> None:
        self.write_features([])
        plan_path = "agent-work/plans/skill-006.md"

        create = self.run_helper(
            "--file",
            str(self.features_file),
            "create",
            "--json",
            json.dumps(
                {
                    "id": "skill-006",
                    "epic": "skill",
                    "status": "pending",
                    "title": "Simplify helper",
                    "description": "Agent can use a simpler helper",
                    "priority": 2,
                    "depends_on": [],
                    "created_at": "2026-03-16",
                }
            ),
            "--output",
            "json",
        )
        self.assertEqual(json.loads(create.stdout)["feature"]["id"], "skill-006")

        update = self.run_helper(
            "--file",
            str(self.features_file),
            "update",
            "skill-006",
            "--json",
            json.dumps({"plan_file": plan_path}),
            "--output",
            "json",
        )
        payload = json.loads(update.stdout)
        self.assertEqual(payload["feature"]["plan_file"], plan_path)
        self.assertIn("plan_file: agent-work/plans/skill-006.md", self.features_file.read_text())

    def test_json_dash_reads_stdin_for_create_and_update(self) -> None:
        self.write_features([])

        create = self.run_helper(
            "--file",
            str(self.features_file),
            "create",
            "--json",
            "-",
            "--output",
            "json",
            input_text=json.dumps({"id": "skill-006", "status": "pending"}),
        )
        self.assertEqual(json.loads(create.stdout)["feature"]["id"], "skill-006")

        update = self.run_helper(
            "--file",
            str(self.features_file),
            "update",
            "skill-006",
            "--json",
            "-",
            "--output",
            "json",
            input_text=json.dumps({"plan_file": "agent-work/plans/skill-006.md"}),
        )
        self.assertEqual(
            json.loads(update.stdout)["feature"]["plan_file"],
            "agent-work/plans/skill-006.md",
        )

    def test_repeated_update_reports_unchanged(self) -> None:
        self.write_features([{"id": "skill-006", "status": "pending"}])
        plan_path = "agent-work/plans/skill-006.md"

        self.run_helper(
            "--file",
            str(self.features_file),
            "update",
            "skill-006",
            "--json",
            json.dumps({"plan_file": plan_path}),
        )
        original = self.features_file.read_text()

        repeated = self.run_helper(
            "--file",
            str(self.features_file),
            "update",
            "skill-006",
            "--json",
            json.dumps({"plan_file": plan_path}),
            "--output",
            "json",
        )
        payload = json.loads(repeated.stdout)
        self.assertFalse(payload["changed"])
        self.assertEqual(payload["updated_fields"], [])
        self.assertEqual(self.features_file.read_text(), original)

    def test_update_rejects_unsupported_fields_and_done_status(self) -> None:
        self.write_features([{"id": "skill-006", "status": "pending"}])

        unsupported = self.run_helper(
            "--file",
            str(self.features_file),
            "update",
            "skill-006",
            "--json",
            json.dumps({"priority": 1}),
            expect_ok=False,
        )
        self.assertIn("unsupported update field(s): priority", unsupported.stderr)
        self.assertIn("supported fields: plan_file, status", unsupported.stderr)

        done_status = self.run_helper(
            "--file",
            str(self.features_file),
            "update",
            "skill-006",
            "--json",
            json.dumps({"status": "done"}),
            expect_ok=False,
        )
        self.assertIn("use complete for done", done_status.stderr)
        self.assertIn("--plan-file", done_status.stderr)

    def test_update_help_includes_examples_and_supported_fields(self) -> None:
        result = self.run_helper("update", "--help")

        self.assertIn("Examples:", result.stdout)
        self.assertIn("Supported fields: status, plan_file", result.stdout)
        self.assertIn("--json -", result.stdout)

    def test_update_dry_run_does_not_mutate_file(self) -> None:
        self.write_features([{"id": "skill-006", "status": "pending"}])
        original = self.features_file.read_text()

        result = self.run_helper(
            "--file",
            str(self.features_file),
            "update",
            "skill-006",
            "--json",
            json.dumps({"status": "in_progress"}),
            "--dry-run",
            "--output",
            "json",
        )
        payload = json.loads(result.stdout)
        self.assertTrue(payload["dry_run"])
        self.assertFalse(payload["changed"])
        self.assertEqual(self.features_file.read_text(), original)

    def test_complete_requires_archive_and_sets_completed_fields(self) -> None:
        self.write_features([{"id": "skill-006", "status": "in_progress"}])
        missing = self.run_helper(
            "--file",
            str(self.features_file),
            "complete",
            "skill-006",
            "--plan-file",
            str(self.workdir / "missing.md"),
            expect_ok=False,
        )
        self.assertIn("archive file not found", missing.stderr)

        archive = self.workdir / "archive.md"
        archive.write_text("archived plan")
        result = self.run_helper(
            "--file",
            str(self.features_file),
            "complete",
            "skill-006",
            "--plan-file",
            str(archive),
            "--output",
            "json",
        )
        payload = json.loads(result.stdout)
        self.assertEqual(payload["feature"]["status"], "done")
        self.assertEqual(payload["feature"]["plan_file"], str(archive))
        self.assertEqual(payload["feature"]["completed_at"], date.today().isoformat())


if __name__ == "__main__":
    unittest.main()
