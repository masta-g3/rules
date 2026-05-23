# skill-015 — Skill Thinking Metadata

Implemented per-skill Pi thinking-level selection for the repo's workflow skills.

## Result

- Added `metadata.thinkingLevel` frontmatter to every canonical workflow skill in `skills/*/SKILL.md`.
- Added `extensions/skill-thinking.ts`, a minimal Pi extension that:
  - detects typed `/skill:<name>` input before skill expansion,
  - finds the loaded skill via `event.systemPromptOptions.skills`,
  - reads `metadata.thinkingLevel` with Pi's exported `parseFrontmatter`,
  - calls `pi.setThinkingLevel(level)` for that turn,
  - restores the previous level on `agent_end` and `session_shutdown`.
- Kept external/package/global skills out of scope.
- Documented activation and behavior in `README.md` and `docs/STRUCTURE.md`.
- Extended `tests/test_pi_extension_imports.py` to verify the extension markers and expected skill metadata mapping.

## Skill Thinking Levels

| Skill | Level |
|---|---|
| `plan-md` | `high` |
| `execute` | `medium` |
| `review` | `high` |
| `commit` | `low` |
| `next-feature` | `minimal` |
| `prime` | `low` |
| `reflect` | `medium` |
| `epic-init` | `high` |
| `project-init` | `high` |
| `test-coverage` | `high` |
| `workflow-migrate` | `medium` |
| `ticket-init` | `medium` |

## Notes

- `metadata.thinkingLevel` is inert without the Pi extension and is ignored by non-Pi harnesses.
- The extension applies to typed `/skill:<name>` commands. Shortcut-generated workflow messages are out of scope because `pi.sendUserMessage('/skill:...')` does not expand skill commands like typed input.
- Pi clamps unsupported thinking levels to the active model's capabilities.

## Verification

- Baseline: `uv run pytest -q` → 31 passed.
- TDD targeted failure observed before implementation.
- Targeted: `uv run pytest -q tests/test_pi_extension_imports.py` → 5 passed.
- Full suite: `uv run pytest -q` → 34 passed.
- Sync smoke: `./sync-prompts.sh --silent` copied the extension and skill metadata to Pi runtime paths.
- Pi load smoke: `pi --no-extensions -e ./extensions/skill-thinking.ts --list-models` loaded successfully.
