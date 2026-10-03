# Rules contributor guidance

- Read `CONTEXT.md` and `docs/STRUCTURE.md` before changing the repository.
- `prompts/AGENTS.md` is the shared instruction template shipped to other projects. This file governs maintenance of Rules itself; keep repo-specific guidance out of the shared template.
- Edit source assets here, not installed copies under harness home directories. Keep shared prompts, skills, and agents portable; put Pi-specific runtime behavior in `extensions/`.
- Prefer revising or removing existing guidance over adding another rule, skill, or workflow stage.
- For significant instruction changes, compare agent behavior on a representative task before adopting them. Judge the resulting work, not claims of compliance. Use this selectively, not as a required stage for every edit.
- Test sync changes with a temporary `HOME`; do not deploy to live harness configuration unless the user requests it. Follow the test command in `README.md` to avoid inherited Hub settings affecting fixtures.
