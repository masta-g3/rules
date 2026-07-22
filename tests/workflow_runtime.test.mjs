import assert from "node:assert/strict";
import test from "node:test";

import {
  continuationContent,
  createContinuationQueue,
  focusContract,
  transition,
  WORKFLOW_STEPS,
} from "../extensions/workflow-runtime/core.ts";

test("the progress rail covers plan through commit", () => {
  assert.deepEqual(WORKFLOW_STEPS, [
    "plan-md",
    "execute",
    "review",
    "reflect",
    "commit",
  ]);
});

const activeState = (overrides = {}) => ({
  activeStep: "execute",
  ticketId: "focus-001",
  execution: {
    mode: "focus",
    runId: "run-1",
    turnsCompleted: 0,
    ...overrides,
  },
});

test("activates focus mode with one workflow state", () => {
  const result = transition(
    { activeStep: "plan-md", ticketId: "existing-001" },
    { type: "activate-focus", ticketId: "focus-001", runId: "run-1" },
  );

  assert.deepEqual(result.effects, []);
  assert.deepEqual(result.state, activeState());
});

test("focus reminders preserve the plan, task, ticket, and exit contract", () => {
  const state = activeState({ turnsCompleted: 4 });

  for (const content of [focusContract(state), continuationContent(state)]) {
    assert.match(content, /active plan document if one exists/);
    assert.match(content, /feature or task the user provided/);
    assert.match(content, /end_focus/);
    assert.match(content, /completed/);
    assert.match(content, /blocked/);
  }

  assert.match(focusContract(state), /Ordinary user input does not end focus mode/);
  assert.match(focusContract(state), /ticket focus-001/);
  assert.match(continuationContent(state), /Active ticket: focus-001/);
  assert.match(continuationContent(state), /Turns completed: 4/);
});

test("every completed focus turn continues automatically", () => {
  const result = transition(activeState(), { type: "agent-end" });

  assert.equal(result.state.execution.turnsCompleted, 1);
  assert.deepEqual(result.effects, [{ kind: "continue", runId: "run-1" }]);
});

test("focus mode has no turn limit", () => {
  let state = activeState();

  for (let turn = 1; turn <= 100; turn += 1) {
    const result = transition(state, { type: "agent-end" });
    assert.equal(result.state.execution.turnsCompleted, turn);
    assert.deepEqual(result.effects, [{ kind: "continue", runId: "run-1" }]);
    state = result.state;
  }
});

test("the explicit focus exit preserves workflow context", () => {
  const result = transition(activeState({ turnsCompleted: 3 }), { type: "end-focus" });

  assert.deepEqual(result, {
    state: { activeStep: "execute", ticketId: "focus-001" },
    effects: [],
  });
});

test("all compaction reasons preserve state and produce no effects", () => {
  for (const reason of ["manual", "threshold", "overflow"]) {
    const state = activeState({ turnsCompleted: 2 });
    const result = transition(state, { type: "session-compact", reason });
    assert.deepEqual(result, { state, effects: [] });
  }
});

test("ordinary input keeps focus mode active", () => {
  const state = activeState({ turnsCompleted: 2 });
  const result = transition(state, { type: "ordinary-input" });

  assert.deepEqual(result, { state, effects: [] });
});

test("session boundaries never restore an active dormant run", () => {
  for (const reason of ["startup", "reload", "resume"]) {
    const result = transition(activeState({ turnsCompleted: 2 }), { type: "session-boundary", reason });
    assert.equal(result.state.execution, undefined, reason);
    assert.equal(result.state.ticketId, "focus-001", reason);
    assert.deepEqual(result.effects, [{ kind: "notify-stop", reason: "session-boundary" }], reason);
  }

  for (const reason of ["new", "fork"]) {
    const result = transition(activeState({ turnsCompleted: 2 }), { type: "session-boundary", reason });
    assert.deepEqual(result.state, {}, reason);
    assert.deepEqual(result.effects, [{ kind: "notify-stop", reason: "session-boundary" }], reason);

    const inactive = transition(
      { activeStep: "review", ticketId: "focus-001" },
      { type: "session-boundary", reason },
    );
    assert.deepEqual(inactive, { state: {}, effects: [] }, `${reason} without active focus mode`);
  }
});

test("continuation queue deduplicates and rejects stale runs", () => {
  const scheduled = [];
  const delivered = [];
  let activeRunId = "run-1";
  const queue = createContinuationQueue((task) => scheduled.push(task));

  assert.equal(queue.enqueue("run-1", () => activeRunId, () => delivered.push("run-1")), true);
  assert.equal(queue.enqueue("run-1", () => activeRunId, () => delivered.push("duplicate")), false);
  assert.equal(scheduled.length, 1);

  scheduled.shift()();
  assert.deepEqual(delivered, ["run-1"]);

  assert.equal(queue.enqueue("run-1", () => activeRunId, () => delivered.push("stale")), true);
  activeRunId = "run-2";
  scheduled.shift()();
  assert.deepEqual(delivered, ["run-1"]);
});
