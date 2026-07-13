import assert from "node:assert/strict";
import test from "node:test";

import {
  createContinuationQueue,
  transition,
  WORKFLOW_STEPS,
} from "../extensions/workflow-runtime/core.ts";

const CONTINUE_MARKER = "LONG EXECUTE CONTINUE";

test("canonical workflow includes the optional prime step", () => {
  assert.deepEqual(WORKFLOW_STEPS, [
    "next-feature",
    "prime",
    "plan-md",
    "execute",
    "review",
    "reflect",
    "commit",
  ]);
});

const activeState = (overrides = {}) => ({
  activeStep: "execute",
  ticketId: "long-execute-002",
  execution: {
    mode: "long",
    runId: "run-1",
    turnsCompleted: 0,
    maxTurns: 6,
    ...overrides,
  },
});

test("activates long execution with one workflow state", () => {
  const result = transition(
    { activeStep: "plan-md", ticketId: "existing-001" },
    { type: "activate-long", ticketId: "long-execute-002", runId: "run-1" },
  );

  assert.deepEqual(result.effects, []);
  assert.deepEqual(result.state, activeState());
});

test("continues only when the marker is the final non-empty line", () => {
  const result = transition(activeState(), {
    type: "agent-end",
    finalAssistantLines: ["Summary: phase complete", CONTINUE_MARKER],
  });

  assert.equal(result.state.execution.turnsCompleted, 1);
  assert.deepEqual(result.effects, [{ kind: "continue", runId: "run-1" }]);

  const missing = transition(activeState(), {
    type: "agent-end",
    finalAssistantLines: [CONTINUE_MARKER, "extra text"],
  });
  assert.equal(missing.state.execution, undefined);
  assert.deepEqual(missing.effects, [{ kind: "notify-stop", reason: "missing-marker" }]);
});

test("stop labels override a later continuation marker", () => {
  for (const label of ["READY FOR REVIEW", "NEEDS USER", "PENDING STEPS", "BLOCKED — credentials required"]) {
    const result = transition(activeState(), {
      type: "agent-end",
      finalAssistantLines: [label, CONTINUE_MARKER],
    });

    assert.equal(result.state.execution, undefined, label);
    assert.equal(result.effects[0].kind, "notify-stop", label);
    assert.equal(result.effects[0].reason, label === "READY FOR REVIEW" ? "ready" : "blocked", label);
  }
});

test("the sixth completed turn stops without queueing a seventh", () => {
  const result = transition(activeState({ turnsCompleted: 5 }), {
    type: "agent-end",
    finalAssistantLines: [CONTINUE_MARKER],
  });

  assert.equal(result.state.execution, undefined);
  assert.deepEqual(result.effects, [{ kind: "notify-stop", reason: "limit" }]);
});

test("all compaction reasons preserve state and produce no effects", () => {
  for (const reason of ["manual", "threshold", "overflow"]) {
    const state = activeState({ turnsCompleted: 2 });
    const result = transition(state, { type: "session-compact", reason });
    assert.deepEqual(result, { state, effects: [] });
  }
});

test("ordinary input stops execution but preserves workflow context", () => {
  const result = transition(activeState({ turnsCompleted: 2 }), { type: "ordinary-input" });

  assert.deepEqual(result.state, {
    activeStep: "execute",
    ticketId: "long-execute-002",
  });
  assert.deepEqual(result.effects, [{ kind: "notify-stop", reason: "user-interruption" }]);
});

test("session boundaries never restore an active dormant run", () => {
  for (const reason of ["startup", "reload", "resume"]) {
    const result = transition(activeState({ turnsCompleted: 2 }), { type: "session-boundary", reason });
    assert.equal(result.state.execution, undefined, reason);
    assert.equal(result.state.ticketId, "long-execute-002", reason);
    assert.deepEqual(result.effects, [{ kind: "notify-stop", reason: "session-boundary" }], reason);
  }

  for (const reason of ["new", "fork"]) {
    const result = transition(activeState({ turnsCompleted: 2 }), { type: "session-boundary", reason });
    assert.deepEqual(result.state, {}, reason);
    assert.deepEqual(result.effects, [{ kind: "notify-stop", reason: "session-boundary" }], reason);

    const inactive = transition(
      { activeStep: "review", ticketId: "long-execute-002" },
      { type: "session-boundary", reason },
    );
    assert.deepEqual(inactive, { state: {}, effects: [] }, `${reason} without active execution`);
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
