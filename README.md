# AI IDE Agent Command Set

Minimal, elegant, and pragmatic commands for use by AI agents embedded in developer IDEs.

---

## Philosophy

- **Minimalist & No-Bloat:** Only automate what is required—no unnecessary features or refactoring.
- **Pattern-Driven:** Follow existing codebase conventions.
- **Deployment First:** Fix only actual blockers to deployment or CI/CD.
- **Readable, Modular, Elegant:** Less is more. Prioritize code clarity and lightweight solutions.

## Key Commands

### Deployment Readiness

- `prechecks.md`: Full-stack, framework-agnostic pre-deployment verification.
    - Runs static checks, build, env, DB, and API validations.
    - Only allows minimal, codebase-consistent fixes.
    - Reports strictly on deployment blockers, in a simple template.

### Codebase Understanding & Context Priming

- `prime.md`: Guides AI agents to read structure docs and related files before any feature work.
    - Fosters code-aware, aligned implementation.
    - Ensures understanding of architecture, components, and coding style.

### Versioning, Commit & Documentation

- `commit.md`: Lightweight, structured commit convention.
    - Ensures commits are focused and self-explanatory.
    - Instructs agents how to document meaningful spec changes.

## Usage

Designed for integration with Claude Code, Codex, Cursor or similar AI agents in developer environments. Consult IDE provider for further instructions.

## Contributing

- Keep all additions minimal, pattern-aligned, and deployment-focused.
- Document new commands precisely and update structure docs as needed.

---

> Created for lean engineering teams using AI pair-programmers. Less code, less entropy: always enough, never more.
