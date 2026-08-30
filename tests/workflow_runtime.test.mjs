import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  completeWorkflow,
  continuationContent,
  createContinuationQueue,
  finalAssistantStopReason,
  FOCUS_MODE_DISPLAY,
  focusScope,
  recoverFocus,
  positionalMarker,
  setWorkflowActivity,
  setWorkflowTicketState,
  shouldNormalizeWorkflowDefinition,
  startWorkflowStep,
  transition,
  withWorkflowDefinition,
  WORKFLOW_ACTIVITIES,
  WORKFLOW_DEFINITION,
} from "../extensions/workflow-runtime/core.ts";

import {
  attentionInput,
  contextSnapshot,
  effectiveProjectCwd,
  parseAttention,
  parseContextSnapshot,
  readTicketContext,
  recentTranscript,
  sanitizeSessionName,
} from "../extensions/workflow-runtime/session-context.ts";
import { parseWorkflowPlan } from "../extensions/workflow-runtime/workflow-plan.ts";

const expectedWorkflowDefinition = [
  { id: "plan-md", short: "PL", label: "Plan" },
  { id: "execute", short: "EX", label: "Execute" },
  { id: "review", short: "RV", label: "Review" },
  { id: "reflect", short: "RF", label: "Reflect" },
  { id: "commit", short: "CM", label: "Commit" },
];

test("ticket changes clear prior step-run and completion state", () => {
  const state = { activeStep: "commit", ticketId: "old-001", currentStepComplete: true, activity: { id: "commit-complete", label: "Commit complete" }, activityPasses: { review: 2 }, plan: { tasks: { completed: 2, total: 3 } } };
  assert.deepEqual(setWorkflowTicketState(state, "new-001", "command"), { activeStep: "commit", ticketId: "new-001", source: "command" });
  assert.deepEqual(setWorkflowTicketState(state, "old-001", "tool"), { ...state, source: "tool" });
});

test("positional markers support active, complete, and direct later steps", () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((index) => positionalMarker(index, 2, false)), ["✓", "✓", "◉", "·", "·"]);
  assert.deepEqual([0, 1, 2, 3, 4].map((index) => positionalMarker(index, 4, true)), ["✓", "✓", "✓", "✓", "✓"]);
});

test("completion is positional, terminal-derived, and reset by later work", () => {
  let state = startWorkflowStep({}, "review");
  assert.equal(state.currentStepComplete, undefined);
  state = setWorkflowActivity(state, "review-complete");
  assert.equal(state.currentStepComplete, true);
  state = setWorkflowActivity(state, "fixing-review-findings");
  assert.equal(state.currentStepComplete, undefined);
  assert.equal(startWorkflowStep(state, "review").currentStepComplete, undefined);
  assert.equal(startWorkflowStep(state, "commit").currentStepComplete, undefined);

  const complete = completeWorkflow({ activeStep: "commit", ticketId: "x-001" });
  assert.equal(complete.currentStepComplete, true);
  assert.deepEqual(complete.activity, { id: "commit-complete", label: "Commit complete" });
  assert.equal(Object.values(WORKFLOW_ACTIVITIES).flat().some((item) => item.id === "commit-complete"), false);
});

test("activity labels use the approved concise display without changing ids", () => {
  assert.deepEqual(Object.fromEntries(Object.values(WORKFLOW_ACTIVITIES).flat().map(({ id, label }) => [id, label])), {
    "inspecting-code": "Inspecting code", "clarifying-requirements": "Clarifying scope", "writing-plan": "Writing plan",
    "reviewing-plan": "Reviewing plan", "updating-plan": "Updating plan", "plan-ready": "Plan ready",
    "reviewing-implementation": "Reviewing changes", "fixing-review-findings": "Fixing findings", "review-complete": "Review complete",
    "reviewing-guidance": "Reviewing guidance", "updating-guidance": "Updating guidance", "reflection-complete": "Reflection complete",
    "archiving-plan": "Archiving plan", "committing-changes": "Committing changes",
  });
});

test("effective project cwd accepts only an absolute managed root", () => {
  assert.equal(effectiveProjectCwd("/source", "/managed/worktree"), "/managed/worktree");
  assert.equal(effectiveProjectCwd("/source", "relative/path"), "/source");
  assert.equal(effectiveProjectCwd("/source", "/bad\0path"), "/source");
  assert.equal(effectiveProjectCwd("/source", ""), "/source");
  assert.equal(effectiveProjectCwd("/source", undefined), "/source");
});

test("producer activities validate steps and count critic passes", () => {
  assert.deepEqual(WORKFLOW_ACTIVITIES.commit.map(({ label }) => label), ["Archiving plan", "Committing changes"]);
  let state = startWorkflowStep({}, "plan-md", "input");
  assert.equal(state.activity.label, "Inspecting code");
  state = setWorkflowActivity(state, "reviewing-plan");
  assert.deepEqual(state.activity, { id: "reviewing-plan", label: "Reviewing plan" });
  state = setWorkflowActivity(state, "updating-plan");
  state = setWorkflowActivity(state, "reviewing-plan");
  assert.equal(state.activity.pass, 2);
  state = setWorkflowActivity(state, "reviewing-plan");
  assert.equal(state.activity.pass, 3);
  assert.throws(() => setWorkflowActivity(state, "reviewing-implementation"), /does not belong/);
  let review = startWorkflowStep({}, "review");
  assert.deepEqual(review.activity, { id: "reviewing-implementation", label: "Reviewing changes" });
  review = setWorkflowActivity(review, "reviewing-implementation");
  assert.equal(review.activity.pass, undefined);
  review = setWorkflowActivity(review, "reviewing-implementation");
  assert.equal(review.activity.pass, 2);
  assert.equal(startWorkflowStep(state, "execute").activity, undefined);
});

test("session context bounds transcript, names, and attention", () => {
  const entries = [
    { type: "custom", message: { role: "user", content: "ignore" } },
    { type: "message", message: { role: "user", content: [{ type: "image" }, { type: "text", text: "  first   prompt " }] } },
    ...Array.from({ length: 8 }, (_, i) => ({ type: "message", message: { role: i % 2 ? "assistant" : "user", content: `message ${i} ${"x".repeat(700)}` } })),
  ];
  assert.ok(recentTranscript(entries).length <= 3000);
  assert.equal(recentTranscript(entries).split("\n\n").length, 4);
  assert.equal(sanitizeSessionName('"metadata redesign"'), "Metadata Redesign");
  assert.equal(sanitizeSessionName("four word session name"), undefined);
  assert.deepEqual(parseAttention('{"kind":"ready","text":"Review the patch","confidence":0.8}'), { kind: "ready", text: "Review the patch" });
  assert.equal(parseAttention("null"), null);
  assert.equal(parseAttention('{"kind":"ready","text":"Maybe","confidence":0.4}'), undefined);
  assert.ok(attentionInput("request", "done", { id: "x-001", description: "Outcome" }, "Plan ready").includes("Current context"));
  const snapshot = { version: 1, updatedAt: 7, ticket: { id: "x-001", subtitle: "Scan context", future: true }, attention: { kind: "ready", text: "Review it" }, future: true };
  assert.deepEqual(parseContextSnapshot(snapshot), { version: 1, updatedAt: 7, ticket: { id: "x-001", subtitle: "Scan context" }, attention: { kind: "ready", text: "Review it" } });
  assert.equal(parseContextSnapshot({ ...snapshot, version: 2 }), undefined);
  assert.equal(parseContextSnapshot({ ...snapshot, attention: { kind: "ready", text: "x".repeat(97) } }), undefined);
  assert.deepEqual(contextSnapshot({ id: "x-001", title: "Ignored", subtitle: "Scan context" }, undefined, 7), { version: 1, updatedAt: 7, ticket: { id: "x-001", subtitle: "Scan context" } });
});

test("ticket context resolves canonical fields and legacy plan title", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "rules-context-"));
  try {
    await mkdir(join(cwd, "agent-work/plans"), { recursive: true });
    await writeFile(join(cwd, "agent-work/features.yaml"), `- id: meta-001\n  title: Metadata redesign\n  subtitle: Simplify cross package session context\n  description: User can rely on one\n    context.\n  metadata:\n    title: Wrong nested title\n    description: Wrong nested description.\n  plan_file: agent-work/plans/meta-001.md\n- id: legacy-001\n  plan_file: agent-work/plans/legacy-001.md\n- id: legacy-arrow-001\n  plan_file: agent-work/plans/legacy-arrow-001.md\n`);
    await writeFile(join(cwd, "agent-work/plans/legacy-001.md"), "**Feature:** Legacy naming\n");
    await writeFile(join(cwd, "agent-work/plans/legacy-arrow-001.md"), "**Feature:** `legacy-arrow-001` → Legacy naming\n");
    assert.deepEqual(await readTicketContext(cwd, "meta-001"), { id: "meta-001", title: "Metadata redesign", subtitle: "Simplify cross package session context", description: "User can rely on one context.", planFile: "agent-work/plans/meta-001.md" });
    assert.equal((await readTicketContext(cwd, "legacy-001")).title, "Legacy naming");
    assert.equal((await readTicketContext(cwd, "legacy-arrow-001")).title, "Legacy naming");
    assert.equal(await readTicketContext(cwd, "missing-001"), undefined);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("deterministic plan projection handles phases, fences, and flat lists", () => {
  const parsed = parseWorkflowPlan(`# Plan\n\n### Phase 1: Foundation\n- [x] First\n- [ ] Second\n\n\`\`\`md\n- [ ] ignored\n\`\`\`\n### Phase 2 — Finish\n- [ ] Third`);
  assert.equal(parsed.plan.total, 3);
  assert.deepEqual(parsed.projection.phase, { index: 1, count: 2, title: "Foundation" });
  assert.deepEqual(parsed.projection.tasks, { completed: 1, total: 3 });
  assert.equal(parsed.projection.nextStep, "Second");
  assert.deepEqual(parseWorkflowPlan("- [x] A\n- [ ] B").projection.tasks, { completed: 1, total: 2 });

  const scoped = parseWorkflowPlan("### Phase 1: Foundation\n- [ ] Phase task\n\n## Verification\n- [ ] Outside phase\n\n### Phase 2: Finish\n- [ ] Final task");
  assert.deepEqual(scoped.projection.tasks, { completed: 0, total: 2 });
  assert.deepEqual(scoped.projection.phases, [{ completed: 0, total: 1 }, { completed: 0, total: 1 }]);

  const hundredPhases = Array.from({ length: 100 }, (_, index) => `### Phase ${index + 1}: P${index + 1}\n- [ ] Task ${index + 1}`).join("\n");
  const bounded = parseWorkflowPlan(hundredPhases).projection;
  assert.equal(bounded.phase.count, 100);
  assert.equal(bounded.phases.length, 100);
});

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
    scope: "execute",
    runId: "run-1",
    turnsCompleted: 0,
    ...overrides,
  },
});

test("workflow completion retains terminal state only from Commit", () => {
  const completed = completeWorkflow({ activeStep: "commit", ticketId: "workflow-board-001", source: "input" });
  assert.deepEqual(completed, {
    activeStep: "commit", ticketId: "workflow-board-001", source: "input",
    currentStepComplete: true, activity: { id: "commit-complete", label: "Commit complete" },
  });
});

test("workflow completion is rejected outside Commit without clearing", () => {
  for (const activeStep of [undefined, "plan-md", "execute", "review", "reflect"]) {
    let cleared = false;
    assert.throws(
      () => completeWorkflow({ activeStep }),
      /only be completed during commit/i,
      String(activeStep),
    );
    assert.equal(cleared, false, String(activeStep));
  }
});

test("an incomplete commit closeout keeps Commit active", () => {
  const state = { activeStep: "commit", ticketId: "workflow-board-001", source: "input" };

  assert.deepEqual(transition(state, { type: "agent-end", stopReason: "stop" }), {
    state,
    effects: [],
  });
});

test("focus scope is limited to Execute and standalone work", () => {
  assert.equal(focusScope({ activeStep: "execute" }), "execute");
  assert.equal(focusScope({}), "standalone");
  for (const activeStep of ["plan-md", "review", "reflect", "commit"]) {
    assert.equal(focusScope({ activeStep }), undefined, activeStep);
  }
});

test("activates focus without selecting a workflow step", () => {
  const execute = transition(
    { activeStep: "execute", ticketId: "focus-001" },
    { type: "activate-focus", scope: "execute", ticketId: "focus-001", runId: "run-1" },
  );
  assert.deepEqual(execute, { state: activeState(), effects: [] });

  const standalone = transition(
    {},
    { type: "activate-focus", scope: "standalone", runId: "run-2" },
  );
  assert.deepEqual(standalone, {
    state: {
      execution: { mode: "focus", scope: "standalone", runId: "run-2", turnsCompleted: 0 },
    },
    effects: [],
  });
});

test("focus reminders follow the active scope and require explicit exit", () => {
  const execute = continuationContent(activeState({ turnsCompleted: 4 }));

  assert.match(execute, /active focus run for ticket focus-001/);
  assert.match(execute, /Follow Execute and the active plan/);
  assert.match(execute, /Verify progress against the actual result/);
  assert.match(execute, /call `end_focus`/);
  assert.match(execute, /outcome `completed`/);
  assert.match(execute, /`blocked`/);
  assert.match(execute, /concise summary/);
  assert.match(execute, /Do not stop at a progress report or leave focus active/);
  assert.doesNotMatch(execute, /Turns completed|turnsCompleted|next turn/);

  const unticketed = continuationContent({ ...activeState(), ticketId: undefined });
  assert.match(unticketed, /^Continue the active Execute focus run/);

  const standalone = continuationContent({
    execution: { mode: "focus", scope: "standalone", runId: "run-2", turnsCompleted: 2 },
  });
  assert.match(standalone, /^Continue the active standalone focus run/);
  assert.match(standalone, /Follow the user's task and project instructions/);
  assert.match(standalone, /only when the user explicitly requests it/);
  assert.doesNotMatch(standalone, /Follow Execute/);
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
