---
name: test-coverage
description: Assess test coverage, propose critical tests, implement on confirmation.
disable-model-invocation: true
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

For each critical path, assess coverage:
- **Covered**: tests exist
- **Partial**: happy path only
- **Gap**: no tests, risk if it breaks

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
- Test outcomes, not implementation
- Use real data over elaborate mocks
- Run tests to verify they pass

If existing tests fail before adding new ones, report to user first.

---

**Test quality principles:**
- A test should fail when the feature breaks, pass when it works
- Prefer integration tests when behavior spans components
- Tests should survive refactoring of internals
