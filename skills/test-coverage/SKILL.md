---
name: test-coverage
description: Assess project test coverage, propose critical tests, implement on confirmation.
---

Analyze the project's test coverage and propose tests that would catch real bugs.

### 1. Survey Infrastructure

Identify:
- Testing framework in use (pytest, jest, go test, etc.)
- Test locations and naming conventions
- How to run tests

If no tests exist, note this and proceed.

### 2. Map Critical Paths

Identify code where bugs have real consequences:

- **Data integrity**: validation, sanitization, transformations
- **Auth**: login, permissions, token handling
- **Business logic**: calculations, state transitions, rules
- **Integrations**: API calls, database queries, file I/O
- **Error handling**: recovery paths, user-facing errors

Skip trivial code—getters, boilerplate, simple wrappers, layout.

### 3. Identify Gaps

For each critical path, assess coverage: **covered**, **partial** (happy path only), or **gap** (no tests, risk if it breaks).

### 4. Report to User

Present a concise summary:

```
## Test Coverage

**Framework**: [name] | **Run**: `[command]`
**Current**: [n] test files, [coverage if known]

### Suggested Tests

1. **[file/function]** — [what it does, why it matters]
   → Test: [brief description of test approach]

2. **[file/function]** — [what it does, why it matters]
   → Test: [brief description of test approach]

### Not Prioritized
- [area]: [why it doesn't need tests yet]

Ready to implement? Confirm and I'll add these tests.
```

Keep the list focused—3-7 high-value tests, not exhaustive coverage.

### 5. Implement on Confirmation

Once user confirms:
- Write tests following existing conventions
- One test per behavior, no duplication
- Test outcomes, not implementation; prefer integration tests when behavior spans components
- Use real data over elaborate mocks
- Run tests to verify they pass

If existing tests fail before adding new ones, report to user first.