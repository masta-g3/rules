from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def skill(name: str) -> str:
    return (ROOT / "skills" / name / "SKILL.md").read_text()


def test_ticket_and_plan_authoring_contract() -> None:
    ticket = skill("ticket-init")
    plan = skill("plan-md")
    assert "1–3 concrete words" in ticket
    assert "4–6 words" in ticket
    assert "one concise outcome sentence" in ticket
    assert "Never write `steps`" in ticket
    assert "{canonical title}" in plan
    assert "nonempty legacy `steps`" in plan


def test_skills_rely_on_runtime_for_observable_activity_boundaries() -> None:
    plan = skill("plan-md")
    assert "`writing-plan`" in plan and "`updating-plan`" in plan and "`plan-ready`" in plan
    assert "call it with `inspecting-code`" not in plan
    assert "call it with `clarifying-requirements`" not in plan
    assert "call `set_workflow_activity` with `reviewing-plan`" not in plan

    for name, activity, critic in (
        ("review", "reviewing-implementation", "code-critic"),
        ("reflect", "reviewing-guidance", "docs-critic"),
    ):
        source = skill(name)
        assert f"starts with `{activity}` as its default activity" in source
        assert f"call it with `{activity}` only immediately before each {critic} pass" not in source
        assert "non-tmux" in source

    commit = skill("commit")
    assert "call it with `archiving-plan`" not in commit
    assert "`committing-changes`" in commit
    assert "complete_workflow" in commit


def test_execute_does_not_publish_semantic_activity() -> None:
    source = skill("execute")
    assert "set_workflow_activity" not in source
