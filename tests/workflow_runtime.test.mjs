import assert from "node:assert/strict";
import test from "node:test";

import {
  continuationContent,
  createContinuationQueue,
  finalAssistantStopReason,
  FOCUS_MODE_DISPLAY,
  recoverFocus,
  shouldNormalizeWorkflowDefinition,
  transition,
  withWorkflowDefinition,
  WORKFLOW_DEFINITION,
} from "../extensions/workflow-runtime/core.ts";

const expectedWorkflowDefinition = [
  { id: "plan-md", short: "PL", label: "Plan" },
  { id: "execute", short: "EX", label: "Execute" },
  { id: "review", short: "RV", label: "Review" },
  { id: "reflect", short: "RF", label: "Reflect" },
  { id: "commit", short: "CM", label: "Commit" },
];

test("the producer owns the ordered workflow definition", () => {
  assert.deepEqual(WORKFLOW_DEFINITION, expectedWorkflowDefinition);
});

test("persisted runtime data includes the producer definition", () => {
  assert.deepEqual(
    withWorkflowDefinition({
      activeStep: "execute",
      ticketId: "workflow-board-001",
      source: "input",
      updatedAt: 1784772000000,
    }),
    {
      activeStep: "execute",
      ticketId: "workflow-board-001",
      source: "input",
      updatedAt: 1784772000000,
      steps: expectedWorkflowDefinition,
    },
  );
});

test("focus entries publish one producer-owned active mode display", () => {
  const focused = withWorkflowDefinition({
    ...activeState({ turnsCompleted: 4 }),
    updatedAt: 1784772000000,
  });

  assert.deepEqual(FOCUS_MODE_DISPLAY, { id: "focus", short: "FOC", label: "Focus" });
  assert.deepEqual(focused.activeMode, {
    id: "focus",
    short: "FOC",
    label: "Focus",
    detail: "turn 4",
  });
  assert.equal(focused.steps.find((step) => step.id === "execute")?.short, "EX");

  const continued = transition(activeState({ turnsCompleted: 4 }), {
    type: "agent-end",
    stopReason: "stop",
  });
  assert.equal(withWorkflowDefinition(continued.state).activeMode?.detail, "turn 5");

  const exited = transition(continued.state, { type: "end-focus" });
  assert.equal(withWorkflowDefinition(exited.state).activeMode, undefined);
  assert.equal(withWorkflowDefinition({ activeStep: "execute" }).activeMode, undefined);
});

test("only active historical sessions need producer definition normalization", () => {
  const historicalActive = { activeStep: "review", ticketId: "workflow-board-001" };
  for (const reason of ["startup", "reload", "resume"]) {
    assert.equal(shouldNormalizeWorkflowDefinition(historicalActive, reason), true, reason);
    assert.equal(
      shouldNormalizeWorkflowDefinition(withWorkflowDefinition(historicalActive), reason),
      false,
      `${reason} current definition`,
    );
  }

  for (const steps of [
    expectedWorkflowDefinition.slice().reverse(),
    expectedWorkflowDefinition.map((step) => (step.id === "execute" ? { ...step, short: "DO" } : step)),
    expectedWorkflowDefinition.map((step) => (step.id === "review" ? { ...step, label: "Inspect" } : step)),
  ]) {
    assert.equal(shouldNormalizeWorkflowDefinition({ ...historicalActive, steps }, "resume"), true);
  }

  assert.equal(shouldNormalizeWorkflowDefinition({}, "new"), false);
  assert.equal(shouldNormalizeWorkflowDefinition({}, "startup"), false);
  assert.equal(shouldNormalizeWorkflowDefinition({ ticketId: "workflow-board-001" }, "resume"), false);
  assert.equal(shouldNormalizeWorkflowDefinition(historicalActive, "new"), false);
  assert.equal(shouldNormalizeWorkflowDefinition(historicalActive, "fork"), false);
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

test("focus reminders name the work, verification step, and explicit exit", () => {
  const content = continuationContent(activeState({ turnsCompleted: 4 }));

  assert.match(content, /active focus run for ticket focus-001/);
  assert.match(content, /Follow `execute` and the active plan when present/);
  assert.match(content, /otherwise continue the user's task/);
  assert.match(content, /Verify progress against the repository/);
  assert.match(content, /call `end_focus`/);
  assert.match(content, /outcome `completed`/);
  assert.match(content, /`blocked`/);
  assert.match(content, /concise summary/);
  assert.match(content, /Do not stop at a progress report or leave focus active/);
  assert.doesNotMatch(content, /Turns completed|turnsCompleted|next turn/);

  const unticketed = continuationContent({ ...activeState(), ticketId: undefined });
  assert.doesNotMatch(unticketed, /ticket focus-001/);
  assert.match(unticketed, /^Follow `execute`/);
});

test("focus recovery chooses one delivery for each Pi lifecycle path", () => {
  assert.deepEqual(recoverFocus(false, { type: "ordinary-input", streaming: false }), {
    pending: true,
  });
  assert.deepEqual(recoverFocus(false, { type: "ordinary-input", streaming: true }), {
    pending: false,
  });
  assert.deepEqual(recoverFocus(false, { type: "session-compact", willRetry: false }), {
    pending: false,
  });
  assert.deepEqual(recoverFocus(false, { type: "session-compact", willRetry: true }), {
    pending: false,
    delivery: "steer",
  });

  const pending = recoverFocus(false, { type: "ordinary-input", streaming: false });
  assert.deepEqual(recoverFocus(pending.pending, { type: "before-agent-start" }), {
    pending: false,
    delivery: "before-agent-start",
  });

  const retry = recoverFocus(pending.pending, { type: "session-compact", willRetry: true });
  assert.deepEqual(retry, { pending: false, delivery: "steer" });
  assert.deepEqual(recoverFocus(retry.pending, { type: "before-agent-start" }), {
    pending: false,
  });
});

test("every successfully completed focus run continues automatically", () => {
  const result = transition(activeState(), { type: "agent-end", stopReason: "stop" });

  assert.equal(result.state.execution.turnsCompleted, 1);
  assert.deepEqual(result.effects, [{ kind: "continue", runId: "run-1" }]);
});

test("aborted and failed focus runs pause without scheduling a continuation", () => {
  for (const stopReason of ["aborted", "error", "length", "toolUse", undefined]) {
    const state = activeState({ turnsCompleted: 2 });
    const result = transition(state, { type: "agent-end", stopReason });

    assert.deepEqual(result, { state, effects: [] }, String(stopReason));
  }
});

test("the final assistant stop reason ignores trailing tool results", () => {
  assert.equal(
    finalAssistantStopReason([
      { role: "assistant", stopReason: "aborted" },
      { role: "toolResult" },
    ]),
    "aborted",
  );
  assert.equal(finalAssistantStopReason([{ role: "user" }]), undefined);
});

test("focus mode has no turn limit", () => {
  let state = activeState();

  for (let turn = 1; turn <= 100; turn += 1) {
    const result = transition(state, { type: "agent-end", stopReason: "stop" });
    assert.equal(result.state.execution.turnsCompleted, turn);
    assert.deepEqual(result.effects, [{ kind: "continue", runId: "run-1" }]);
    state = result.state;
  }
});

test("the explicit focus exit preserves workflow context and prevents later continuation", () => {
  const exited = transition(activeState({ turnsCompleted: 3 }), { type: "end-focus" });

  assert.deepEqual(exited, {
    state: { activeStep: "execute", ticketId: "focus-001" },
    effects: [],
  });
  assert.deepEqual(transition(exited.state, { type: "agent-end", stopReason: "stop" }), {
    state: exited.state,
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
