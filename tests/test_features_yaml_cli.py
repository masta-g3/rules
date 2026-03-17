#!/usr/bin/env python3

import json
import subprocess
import tempfile
import unittest
from datetime import date
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
HELPER = REPO_ROOT / "skills" / "_lib" / "features_yaml.sh"


class FeaturesYamlCliTest(unittest.TestCase):
    def setUp(self) -> None:
        self.tempdir = tempfile.TemporaryDirectory()
        self.workdir = Path(self.tempdir.name)
        self.features_file = self.workdir / "features.yaml"

    def tearDown(self) -> None:
        self.tempdir.cleanup()

    def write_features(self, payload: list[dict]) -> None:
        self.features_file.write_text(json.dumps(payload, indent=2))

    def run_helper(self, *args: str, expect_ok: bool = True) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            [str(HELPER), *args],
            cwd=self.workdir,
            text=True,
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
        self.assertIn("No features.yaml found", result.stdout)

        missing_id = self.run_helper("--output", "id", "next", expect_ok=False)
        self.assertEqual(missing_id.returncode, 1)

    def test_create_then_update_plan_file_keeps_string_value(self) -> None:
        self.write_features([])
        plan_path = "docs/plans/skill-006.md"

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
        self.assertIn("plan_file: docs/plans/skill-006.md", self.features_file.read_text())

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
