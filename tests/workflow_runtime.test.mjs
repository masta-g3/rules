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
  unlinkWorkflowTicketState,
  setOrchestration,
  parkedAttention,
  withWorkflowDefinition,
  WORKFLOW_ACTIVITIES,
  WORKFLOW_DEFINITION,
} from "../extensions/workflow-runtime/core.ts";

import {
  contextSnapshot,
  effectiveProjectCwd,
  parseContextSnapshot,
  parseProgressNote,
  questionAttention,
  readTicketContext,
  stableRequestId,
  recentTranscript,
  sanitizeSessionName,
} from "../extensions/workflow-runtime/session-context.ts";
import { parseWorkflowPlan } from "../extensions/workflow-runtime/workflow-plan.ts";
import { closeoutKinds, runsGitCommit } from "../extensions/workflow-runtime/commit-facts.ts";

const expectedWorkflowDefinition = [
  { id: "plan-md", short: "PL", label: "Plan" },
  { id: "execute", short: "EX", label: "Execute" },
  { id: "review", short: "RV", label: "Review" },
  { id: "reflect", short: "RF", label: "Reflect" },
  { id: "commit", short: "CM", label: "Commit" },
];

test("worktree wire parsing returns only normalized bounded fields", () => {
  const parsed = parseContextSnapshot({
    version: 1, updatedAt: 1, unknown: "drop",
    worktree: {
      version: 1, recordId: " record ", producer: " other ", revision: 2, updatedAt: 3, unknown: "drop",
      repositories: [{
        sourcePath: " /source ", worktreePath: " /worktree ", branch: " task ", role: "primary", state: "active",
        issue: "bounded   issue", unknown: "drop",
      }],
    },
  });
  assert.deepEqual(parsed.worktree, {
    version: 1, recordId: "record", producer: "other", revision: 2, updatedAt: 3,
    repositories: [{ sourcePath: "/source", worktreePath: "/worktree", branch: "task", role: "primary", state: "active", issue: "bounded issue" }],
  });
});

test("ticket changes clear prior step-run and completion state", () => {
  const state = { activeStep: "commit", ticketId: "old-001", currentStepComplete: true, activity: { id: "commit-complete", label: "Commit complete" }, activityPasses: { review: 2 }, plan: { tasks: { completed: 2, total: 3 } } };
  assert.deepEqual(setWorkflowTicketState(state, "new-001", "command"), { activeStep: "commit", ticketId: "new-001", source: "command" });
  assert.deepEqual(setWorkflowTicketState(state, "old-001", "tool"), { ...state, source: "tool" });
});

test("ticket unlink preserves rail progress but removes ticket-derived state", () => {
  const state = {
    activeStep: "commit", ticketId: "old-001", currentStepComplete: true,
    activity: { id: "commit-complete", label: "Commit complete" },
    activityPasses: { "reviewing-plan": 2 }, plan: { tasks: { completed: 2, total: 3 } },
    execution: { mode: "focus", scope: "execute", runId: "old-run", turnsCompleted: 2 },
    source: "input", updatedAt: 10,
  };
  assert.deepEqual(unlinkWorkflowTicketState(state, "command"), {
    activeStep: "commit", currentStepComplete: true,
    activity: { id: "commit-complete", label: "Commit complete" },
    activityPasses: { "reviewing-plan": 2 }, source: "command", updatedAt: 10,
  });
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
    "archiving-plan": "Archiving plan", "committing-changes": "Committing changes", "pushing-changes": "Pushing changes",
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
  assert.deepEqual(WORKFLOW_ACTIVITIES.commit.map(({ label }) => label), ["Archiving plan", "Committing changes", "Pushing changes"]);
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
  for (const length of [97, 150]) {
    const attention = { kind: "ready", text: "x".repeat(length) };
    assert.deepEqual(parseContextSnapshot({ version: 1, updatedAt: 1, attention })?.attention, attention);
  }
  const handoff = { requestId: "a".repeat(64), kind: "ready", text: "Review it", recommendation: "Commit it", artifact: "/tmp/agent  work/validation.md" };
  assert.deepEqual(parseContextSnapshot(contextSnapshot(undefined, handoff, 3))?.attention, handoff);
  assert.equal(parseContextSnapshot({ version: 1, updatedAt: 1, attention: { ...handoff, artifact: "/tmp/\u001b[31mx" } }), undefined);
  assert.equal(parseContextSnapshot({ version: 1, updatedAt: 1, attention: { ...handoff, recommendation: "x".repeat(151) } }), undefined);
  const snapshot = { version: 1, updatedAt: 7, ticket: { id: "x-001", subtitle: "Scan context", future: true }, attention: { kind: "ready", text: "Review it" }, future: true };
  assert.deepEqual(parseContextSnapshot(snapshot), { version: 1, updatedAt: 7, ticket: { id: "x-001", subtitle: "Scan context" }, attention: { kind: "ready", text: "Review it" } });
  assert.equal(parseContextSnapshot({ ...snapshot, version: 2 }), undefined);
  assert.equal(parseContextSnapshot({ ...snapshot, attention: { kind: "ready", text: "x".repeat(151) } }), undefined);
  assert.deepEqual(contextSnapshot({ id: "x-001", title: "Ignored", subtitle: "Scan context" }, undefined, 7), { version: 1, updatedAt: 7, ticket: { id: "x-001", subtitle: "Scan context" } });
});

test("question attention has bounded deterministic request identity and summary", () => {
  assert.equal(stableRequestId("call_123"), "2ce6deda1dec6b4c566f38ac5241867b7e29965901ddcdf87d05cb025e1896af");
  assert.equal(stableRequestId("call_123"), stableRequestId("call_123"));
  assert.notEqual(stableRequestId("call_123"), stableRequestId("call_124"));

  assert.deepEqual(questionAttention("call_123", {
    questions: [
      { question: "  Choose\n\tthe\u0000 rollout?  ", options: [{ label: "Private option", description: "Never publish" }], multiple: true },
      { question: "Second question" },
      { question: "Third question" },
    ],
  }), {
    requestId: stableRequestId("call_123"),
    kind: "question",
    text: "Choose the rollout? (+2 more)",
  });

  const bounded = questionAttention("long-call", {
    questions: [{ question: "x".repeat(200) }, { question: "another" }],
  });
  assert.equal([...bounded.text].length, 150);
  assert.ok(bounded.text.endsWith(" (+1 more)"));
  assert.equal(bounded.text.includes("another"), false);

  for (const [id, args] of [[undefined, { questions: [{ question: "Valid" }] }], ["", { questions: [{ question: "Valid" }] }], ["id", undefined], ["id", {}], ["id", { questions: [] }], ["id", { questions: [{ question: " \n " }] }]]) {
    assert.equal(questionAttention(id, args), undefined);
  }
});

test("context request IDs round trip only within the 64-character contract", () => {
  const attention = { requestId: "r".repeat(64), kind: "question", text: "Choose a rollout" };
  assert.deepEqual(
    parseContextSnapshot(contextSnapshot({ id: "x-001" }, attention, 9)),
    { version: 1, updatedAt: 9, ticket: { id: "x-001" }, attention },
  );
  const base = { version: 1, updatedAt: 9, attention: { kind: "question", text: "Choose a rollout" } };
  assert.equal(parseContextSnapshot({ ...base, attention: { ...base.attention, requestId: "r".repeat(65) } }), undefined);
  assert.equal(parseContextSnapshot({ ...base, attention: { ...base.attention, requestId: "bad\nid" } }), undefined);
  assert.deepEqual(parseContextSnapshot(base)?.attention, { kind: "question", text: "Choose a rollout" });
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
  assert.deepEqual(scoped.projection.phases, [{ completed: 0, total: 1, title: "Foundation" }, { completed: 0, total: 1, title: "Finish" }]);

  const hundredPhases = Array.from({ length: 100 }, (_, index) => `### Phase ${index + 1}: P${index + 1}\n- [ ] Task ${index + 1}`).join("\n");
  const bounded = parseWorkflowPlan(hundredPhases).projection;
  assert.equal(bounded.phase.count, 100);
  assert.equal(bounded.phases.length, 100);
});

test("plan projection publishes a bounded window of current section tasks", () => {
  const short = parseWorkflowPlan("### Phase 1: Build\n- [x] A\n- [x] B\n### Phase 2: Ship\n- [x] C\n- [ ] D").projection;
  assert.deepEqual(short.current, { tasks: [{ done: true, text: "C" }, { done: false, text: "D" }], before: 0, after: 0 });
  assert.deepEqual(short.phases.map((phase) => phase.title), ["Build", "Ship"]);

  const lines = (count, done) => Array.from({ length: count }, (_, index) => `- [${index < done ? "x" : " "}] Task ${index}`).join("\n");
  const middle = parseWorkflowPlan(`### Phase 1: Long\n${lines(20, 6)}`).projection.current;
  assert.deepEqual(middle.tasks.map((task) => task.text), Array.from({ length: 12 }, (_, index) => `Task ${index + 3}`));
  assert.deepEqual([middle.before, middle.after], [3, 5]);
  const early = parseWorkflowPlan(`### Phase 1: Long\n${lines(20, 1)}`).projection.current;
  assert.deepEqual([early.tasks[0].text, early.before, early.after], ["Task 0", 0, 8]);
  const late = parseWorkflowPlan(`### Phase 1: Long\n${lines(20, 19)}`).projection.current;
  assert.deepEqual([late.tasks[0].text, late.tasks.length, late.before, late.after], ["Task 8", 12, 8, 0]);
  const finished = parseWorkflowPlan(`### Phase 1: Long\n${lines(20, 20)}`).projection.current;
  assert.deepEqual([finished.tasks.at(-1).text, finished.tasks.every((task) => task.done), finished.before, finished.after], ["Task 19", true, 8, 0]);

  const flat = parseWorkflowPlan(`# Plan\n${lines(3, 1)}\n- [ ] ${"y".repeat(130)}`).projection;
  assert.equal(flat.phases, undefined);
  assert.deepEqual(flat.current.tasks.slice(0, 2), [{ done: true, text: "Task 0" }, { done: false, text: "Task 1" }]);
  assert.equal(flat.current.tasks.at(-1).text, "y".repeat(100));
  assert.equal(parseWorkflowPlan(`### Phase 1: ${"t".repeat(90)}\n- [ ] A`).projection.phases[0].title, "t".repeat(80));
});

test("progress notes parse tolerant JSON and round trip through context", () => {
  assert.deepEqual(parseProgressNote('{"done":"Added the parser.","next":"Run the tests."}'), { done: "Added the parser.", next: "Run the tests." });
  assert.deepEqual(parseProgressNote('Here:\n```json\n{"done":"  Added\\n tests ","next":""}\n```'), { done: "Added tests" });
  assert.equal(parseProgressNote("not json"), undefined);
  assert.equal(parseProgressNote("{broken"), undefined);
  assert.equal(parseProgressNote('{"done":"","next":"  "}'), undefined);
  assert.equal(parseProgressNote('["done"]'), undefined);
  assert.deepEqual(parseProgressNote(JSON.stringify({ done: "d".repeat(130), next: "n".repeat(121) })), { done: "d".repeat(120), next: "n".repeat(120) });

  const progress = { done: "Added the parser.", next: "Run the tests.", updatedAt: 5 };
  assert.deepEqual(parseContextSnapshot(contextSnapshot({ id: "x-001" }, undefined, 7, undefined, progress)), { version: 1, updatedAt: 7, ticket: { id: "x-001" }, progress });
  assert.deepEqual(parseContextSnapshot(contextSnapshot({ id: "x-001" }, undefined, 7)), { version: 1, updatedAt: 7, ticket: { id: "x-001" } });
  const attention = { kind: "ready", text: "Review it" };
  for (const malformed of [null, "text", { done: "x" }, { updatedAt: 1 }, { done: 3, next: [], updatedAt: 1 }, { done: "x", updatedAt: Infinity }]) {
    assert.deepEqual(parseContextSnapshot({ version: 1, updatedAt: 7, attention, progress: malformed }), { version: 1, updatedAt: 7, attention });
  }
});

test("plan phases end at sibling headings but retain nested checklists", () => {
  const parsed = parseWorkflowPlan("### Phase 1: Build\n- [x] Build\n#### Verification\n- [x] Test\n### Deferred work\n- [ ] Later\n### Phase 2: Ship\n- [ ] Release\n## Notes\n- [ ] Outside");
  assert.deepEqual(parsed.plan.sections.map((section) => section.tasks.map((task) => task.text)), [["Build", "Test"], ["Release"]]);
  assert.deepEqual(parsed.projection.tasks, { completed: 2, total: 3 });
  assert.equal(parsed.projection.nextStep, "Release");
  assert.equal(parsed.projection.phase.index, 2);
});

test("drawer retains full Unicode plan text while progress metadata stays bounded", () => {
  const title = "界".repeat(85) + " title end";
  const task = "🚀".repeat(125) + " preserve all data";
  const parsed = parseWorkflowPlan(`### Phase 1: ${title}\n- [ ] ${task}`);
  assert.equal(parsed.plan.sections[0].heading, `Phase 1 · ${title}`);
  assert.equal(parsed.plan.sections[0].tasks[0].text, task);
  assert.equal(parsed.projection.phase.title, "界".repeat(80));
  assert.equal(parsed.projection.nextStep, "🚀".repeat(120));
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

test("execute publishes a lens from the plan without the internal window", () => {
  const { projection } = parseWorkflowPlan("### Phase 1: Build\n- [x] A\n- [x] B\n### Phase 2: Conversation transport\n- [x] C\n- [ ] D\n- [ ] E\n### Phase 3: Ship\n- [ ] F");
  const entry = withWorkflowDefinition({ activeStep: "execute", ticketId: "x-001", plan: projection });
  assert.deepEqual(entry.lens, {
    doing: "D",
    stages: [{ label: "1", state: "done" }, { label: "2", state: "active" }, { label: "3", state: "pending" }],
    progress: { completed: 3, total: 6, unit: "tasks" },
    list: {
      label: "PLAN", head: "Conversation transport",
      items: [{ state: "done", text: "C" }, { state: "active", text: "D" }, { state: "pending", text: "E" }],
      before: 0, after: 0,
    },
  });
  assert.equal("current" in entry.plan, false);
  assert.deepEqual(entry.plan.tasks, { completed: 3, total: 6 });

  const lines = (count, done) => Array.from({ length: count }, (_, index) => `- [${index < done ? "x" : " "}] Task ${index}`).join("\n");
  const long = withWorkflowDefinition({ activeStep: "execute", plan: parseWorkflowPlan(`### Phase 1: Long\n${lines(20, 6)}`).projection }).lens.list;
  assert.deepEqual([long.items.length, long.before, long.after, long.items[3]], [12, 3, 5, { state: "active", text: "Task 6" }]);

  const many = Array.from({ length: 20 }, (_, index) => `### Phase ${index + 1}: P${index + 1}\n- [${index < 15 ? "x" : " "}] T${index}`).join("\n");
  const stages = withWorkflowDefinition({ activeStep: "execute", plan: parseWorkflowPlan(many).projection }).lens.stages;
  assert.equal(stages.length, 12);
  assert.equal(stages.find((stage) => stage.state === "active").label, "16");

  assert.equal(withWorkflowDefinition({ activeStep: "execute" }).lens, undefined);
  assert.equal(withWorkflowDefinition({ plan: projection }).lens, undefined);
});

test("other steps publish a lens from activity stages and review passes", () => {
  const stageLabels = Object.fromEntries(Object.entries(WORKFLOW_ACTIVITIES).map(([step, items]) => [step, items.map((item) => item.stage)]));
  assert.deepEqual(stageLabels, {
    "plan-md": ["inspect", "scope", "write", "critic", "critic", "ready"], execute: [],
    review: ["review", "fix", "done"], reflect: ["review", "update", "done"], commit: ["archive", "commit", "push"],
  });
  const planStages = (states) => ["inspect", "scope", "write", "critic", "ready"].map((label, index) => ({ label, state: states[index] }));
  let plan = startWorkflowStep({}, "plan-md");
  assert.deepEqual(withWorkflowDefinition(plan).lens, { doing: "Inspecting code", stages: planStages(["active", "pending", "pending", "pending", "pending"]) });
  plan = setWorkflowActivity(plan, "writing-plan");
  assert.deepEqual(withWorkflowDefinition(plan).lens.stages, planStages(["done", "done", "active", "pending", "pending"]));
  for (const activity of ["reviewing-plan", "updating-plan"]) {
    plan = setWorkflowActivity(plan, activity);
    assert.deepEqual(withWorkflowDefinition(plan).lens.stages, planStages(["done", "done", "done", "active", "pending"]), activity);
  }
  assert.equal(withWorkflowDefinition(setWorkflowActivity(plan, "plan-ready")).lens, undefined);

  let review = setWorkflowActivity(startWorkflowStep({}, "review"), "reviewing-implementation");
  assert.equal(withWorkflowDefinition(review).lens.pass, undefined);
  review = setWorkflowActivity(review, "reviewing-implementation");
  review = setWorkflowActivity(review, "fixing-review-findings");
  assert.deepEqual(withWorkflowDefinition(review).lens, {
    doing: "Fixing findings",
    stages: [{ label: "review", state: "done" }, { label: "fix", state: "active" }, { label: "done", state: "pending" }],
    pass: 2,
  });

  assert.equal(withWorkflowDefinition({}).lens, undefined);
  assert.deepEqual(withWorkflowDefinition(completeWorkflow(startWorkflowStep({}, "commit"))).lens, {
    doing: "Commit complete", stages: [{ label: "archive", state: "done" }, { label: "commit", state: "done" }],
  });
});

test("parseWorkflowPlan counts acceptance criteria under their heading only", () => {
  const text = "## Phase 1: Build\n- [ ] A\n## Acceptance Criteria\n- [ ] One\n- [x] Two\n### Notes\n- [ ] Three\n## Risks\n- [ ] Not a criterion\n```\n- [ ] fenced\n```";
  assert.equal(parseWorkflowPlan(text).projection.criteria, 3);
  assert.equal(parseWorkflowPlan("## Phase 1: Build\n- [ ] A").projection.criteria, undefined);
  // The criteria count feeds the lens only.
  assert.equal("criteria" in withWorkflowDefinition({ activeStep: "plan-md", plan: parseWorkflowPlan(text).projection }).plan, false);
});

test("plan-md lens lists plan facts, answered and waiting questions, and the critic pass", () => {
  let plan = startWorkflowStep({}, "plan-md");
  assert.equal(withWorkflowDefinition(plan).lens.list, undefined);
  plan = { ...setWorkflowActivity(plan, "clarifying-requirements"), stepFacts: { questions: { answered: 4, waiting: { count: 1, text: "Keep the button?", requestId: "r" } } } };
  assert.deepEqual(withWorkflowDefinition(plan).lens.list, {
    label: "PLAN", items: [{ state: "done", text: "4 answered" }, { state: "attention", text: "1 waiting: Keep the button?" }], before: 0, after: 0,
  });
  const phases = "## Phase 1: A\n- [ ] a\n- [ ] b\n## Phase 2: B\n- [ ] c\n## Acceptance Criteria\n- [ ] x\n- [ ] y";
  plan = { ...plan, plan: parseWorkflowPlan(phases).projection, stepFacts: { questions: { answered: 4 } } };
  assert.deepEqual(withWorkflowDefinition(plan).lens.list, {
    label: "PLAN", head: "2 phases · 3 tasks · 2 criteria", items: [{ state: "done", text: "4 answered" }], before: 0, after: 0,
  });
  assert.deepEqual(withWorkflowDefinition({ ...plan, stepFacts: undefined }).lens.list.items, [{ state: "pending", text: "critic pass 1" }]);
  plan = setWorkflowActivity(plan, "reviewing-plan");
  assert.deepEqual(withWorkflowDefinition(plan).lens.list.items.at(-1), { state: "active", text: "critic pass 1" });
  plan = setWorkflowActivity(setWorkflowActivity(plan, "reviewing-plan"), "updating-plan");
  assert.deepEqual(withWorkflowDefinition(plan).lens.list.items.at(-1), { state: "done", text: "critic pass 2" });

  assert.equal(startWorkflowStep(plan, "execute").stepFacts, undefined);
  assert.equal(unlinkWorkflowTicketState({ ...plan, ticketId: "x-001" }).stepFacts, undefined);
  assert.equal(setWorkflowTicketState({ ...plan, ticketId: "x-001" }, "y-001").stepFacts, undefined);
});

test("commit lens lists closeout and commits, shows push once reached, and stays after completion", () => {
  let commit = startWorkflowStep({ ticketId: "x-001" }, "commit");
  commit = { ...setWorkflowActivity(commit, "committing-changes"), stepFacts: {
    closeout: { archived: true, ticketDone: true },
    commits: [{ repo: "pi-agent-hub", hash: "3f9c2e1", subject: "Add step lens contract" }, { repo: "rules", hash: "a1b2c3d", subject: "Publish the workflow lens" }],
  } };
  assert.deepEqual(withWorkflowDefinition(commit).lens, {
    doing: "Committing changes",
    stages: [{ label: "archive", state: "done" }, { label: "commit", state: "active" }],
    list: { label: "CLOSE", head: "2 commits", items: [
      { state: "done", text: "Plan archived" }, { state: "done", text: "Ticket x-001 done" },
      { state: "done", text: "pi-agent-hub 3f9c2e1 Add step lens contract" }, { state: "done", text: "rules a1b2c3d Publish the workflow lens" },
    ], before: 0, after: 0 },
  });
  const done = withWorkflowDefinition(completeWorkflow(commit)).lens;
  assert.deepEqual(done.stages, [{ label: "archive", state: "done" }, { label: "commit", state: "done" }]);
  assert.equal(done.list.items.length, 4);

  const pushed = setWorkflowActivity(commit, "pushing-changes");
  assert.equal(pushed.stepFacts.pushed, true);
  assert.deepEqual(withWorkflowDefinition(pushed).lens.stages.map((stage) => stage.state), ["done", "done", "active"]);
  const finished = withWorkflowDefinition(completeWorkflow(pushed)).lens;
  assert.deepEqual(finished.stages, [{ label: "archive", state: "done" }, { label: "commit", state: "done" }, { label: "push", state: "done" }]);
  assert.deepEqual(finished.list.items.at(-1), { state: "done", text: "push" });

  const many = { ...commit, stepFacts: { closeout: { archived: true }, commits: Array.from({ length: 14 }, (_, index) => ({ repo: `r${index}`, hash: "abc1234", subject: `S${index}` })) } };
  const list = withWorkflowDefinition(many).lens.list;
  assert.deepEqual([list.head, list.items.length, list.before, list.after, list.items.at(-1).text], ["14 commits", 12, 3, 0, "r13 abc1234 S13"]);
});

test("review and reflect lenses list agent-reported items and keep the final list", () => {
  const findings = [
    { text: "Retry after unknown delivery showed twice", state: "done" },
    { text: "Lost history cursor on empty session", state: "done" },
    { text: "Parser stall on long backtick runs", state: "active" },
    { text: "Failed read dropped loaded history", state: "open" },
    { text: "Login in a link: deferred", state: "deferred" },
  ];
  let review = setWorkflowActivity(setWorkflowActivity(startWorkflowStep({ ticketId: "x-001" }, "review"), "reviewing-implementation"), "reviewing-implementation");
  review = setWorkflowActivity(review, "fixing-review-findings", findings);
  assert.deepEqual(withWorkflowDefinition(review).lens, {
    doing: "Parser stall on long backtick runs",
    stages: [{ label: "review", state: "done" }, { label: "fix", state: "active" }, { label: "done", state: "pending" }],
    pass: 2,
    list: { label: "FOUND", head: "2 fixed · 2 open · 1 deferred", items: [
      { state: "done", text: "Retry after unknown delivery showed twice" }, { state: "done", text: "Lost history cursor on empty session" },
      { state: "active", text: "Parser stall on long backtick runs" }, { state: "pending", text: "Failed read dropped loaded history" },
      { state: "skipped", text: "Login in a link: deferred" },
    ], before: 0, after: 0 },
  });
  // A call without items keeps the list; with no active item DOING is the activity label.
  const settled = setWorkflowActivity(review, "fixing-review-findings", findings.map((item) => ({ ...item, state: item.state === "active" ? "done" : item.state })));
  assert.equal(withWorkflowDefinition(settled).lens.doing, "Fixing findings");
  assert.deepEqual(setWorkflowActivity(review, "reviewing-implementation").stepItems, review.stepItems);
  // The completed step keeps its final list with every stage done under its terminal label, also after a reload.
  const complete = setWorkflowActivity(settled, "review-complete");
  const final = withWorkflowDefinition(complete);
  assert.equal(withWorkflowDefinition(setWorkflowActivity(review, "review-complete")).lens.doing, "Review complete");
  assert.deepEqual(final.lens, { doing: "Review complete", stages: ["review", "fix", "done"].map((label) => ({ label, state: "done" })), pass: 2, list: { ...withWorkflowDefinition(settled).lens.list, head: "3 fixed · 1 open · 1 deferred" } });
  const { steps: _steps, lens: _lens, activeMode: _mode, ...reloaded } = JSON.parse(JSON.stringify(final));
  assert.deepEqual(withWorkflowDefinition(reloaded).lens, final.lens);
  // Without items a completed step still drops its lens.
  assert.equal(withWorkflowDefinition(setWorkflowActivity(startWorkflowStep({}, "review"), "review-complete")).lens, undefined);
  assert.equal(withWorkflowDefinition(setWorkflowActivity(startWorkflowStep({}, "plan-md"), "plan-ready")).lens, undefined);

  let reflect = setWorkflowActivity(startWorkflowStep({}, "reflect"), "updating-guidance", [
    { text: "STRUCTURE.md: transcript source", state: "done" },
    { text: "STRUCTURE.md: Markdown safety rule", state: "active" },
    { text: "New ticket: keyboard dock check", state: "attention" },
    { text: "Retry wording: no change", state: "deferred" },
  ]);
  const cands = withWorkflowDefinition(reflect).lens;
  assert.equal(cands.doing, "STRUCTURE.md: Markdown safety rule");
  assert.deepEqual([cands.list.label, cands.list.head, cands.list.items.map((item) => item.state)], ["CANDS", "1 applied · 1 now · 1 needs you · 1 no action", ["done", "active", "attention", "skipped"]]);
  reflect = setWorkflowActivity(reflect, "reflection-complete", [{ text: "STRUCTURE.md: transcript source", state: "done" }]);
  assert.deepEqual(withWorkflowDefinition(reflect).lens.list.items, [{ state: "done", text: "STRUCTURE.md: transcript source" }]);
  assert.equal(withWorkflowDefinition(reflect).lens.list.head, "1 applied");

  // Items reset on step change, ticket switch and unlink.
  assert.equal(startWorkflowStep(review, "review").stepItems, undefined);
  assert.equal(startWorkflowStep(review, "reflect").stepItems, undefined);
  assert.equal(setWorkflowTicketState(review, "y-001").stepItems, undefined);
  assert.deepEqual(setWorkflowTicketState(review, "x-001").stepItems, review.stepItems);
  assert.equal(unlinkWorkflowTicketState(review).stepItems, undefined);
});

test("activity items are bounded and accepted only in review and reflect", () => {
  const item = { text: "A finding", state: "open" };
  assert.throws(() => setWorkflowActivity(startWorkflowStep({}, "plan-md"), "writing-plan", [item]), /only accepted in review and reflect, not plan-md/);
  assert.throws(() => setWorkflowActivity(startWorkflowStep({}, "commit"), "archiving-plan", []), /only accepted in review and reflect, not commit/);
  const review = startWorkflowStep({}, "review");
  assert.throws(() => setWorkflowActivity(review, "fixing-review-findings", Array(13).fill(item)), /At most 12/);
  assert.throws(() => setWorkflowActivity(review, "fixing-review-findings", [{ text: " \n ", state: "open" }]), /item 1 needs non-empty text/);
  assert.throws(() => setWorkflowActivity(review, "fixing-review-findings", [{ text: "x".repeat(121), state: "open" }]), /exceeds 120/);
  assert.throws(() => setWorkflowActivity(review, "fixing-review-findings", [{ text: "x", state: "pending" }]), /state must be one of/);
  assert.deepEqual(setWorkflowActivity(review, "fixing-review-findings", [{ text: " Two\nlines ", state: "open" }]).stepItems, [{ text: "Two lines", state: "open" }]);
  assert.equal(setWorkflowActivity(review, "fixing-review-findings", Array(12).fill(item)).stepItems.length, 12);
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

  assert.match(execute, /^Continue Execute within the active plan/);
  assert.match(execute, /Re-read it after compaction or whenever details are unclear; follow its verification gates/);
  assert.match(execute, /Prefer removal and simplification; reuse before adding/);
  assert.match(execute, /Verify actual results/);
  assert.match(execute, /Keep working while safe, in-scope work remains/);
  assert.match(execute, /Call end_focus when complete and verified, or blocked; include a brief summary/);
  assert.doesNotMatch(execute, /Turns completed|turnsCompleted|next turn/);

  const unticketed = continuationContent({ ...activeState(), ticketId: undefined });
  assert.equal(unticketed, execute);

  const standalone = continuationContent({
    execution: { mode: "focus", scope: "standalone", runId: "run-2", turnsCompleted: 2 },
  });
  assert.match(standalone, /^Continue the approved task\. Prefer removal and simplification; reuse before adding/);
  assert.match(standalone, /Call end_focus when complete and verified, or blocked; include a brief summary/);
  assert.doesNotMatch(standalone, /Execute|active plan|verification gates/);
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

test("commit and closeout detection reads executables and subcommands, not text", () => {
  for (const command of [
    "git commit -m x", `git -C "/tmp/my repo" commit -m 'a; b'`, "cd app && /usr/bin/git -c user.name=x commit -am y",
    "GIT_AUTHOR_NAME=x git commit -m z", "git add -A; git commit --amend --no-edit", "(cd lib && git commit -m w)",
    "git -C app \\\n  commit -m x", `git -C "app" com\\\nmit -m "multi \\\nline"`,
  ]) assert.equal(runsGitCommit(command), true, command);
  for (const command of [
    "git log --grep=commit", "echo git commit", `git log -m "git commit"`, "git -C commit status", "gh pr commit", "git show HEAD:commit",
  ]) assert.equal(runsGitCommit(command), false, command);

  assert.deepEqual(closeoutKinds(`"$SKILLS_ROOT/commit/scripts/archive_plan.sh" plan.md x && "$SKILLS_ROOT/_lib/features_yaml.sh" complete t-001 --plan-file h.md`), ["archived", "ticketDone"]);
  assert.deepEqual(closeoutKinds("bash archive_plan.sh plan.md x"), ["archived"]);
  assert.deepEqual(closeoutKinds("features_yaml.sh \\\n  complete t-001"), ["ticketDone"]);
  assert.deepEqual(closeoutKinds("features_yaml.sh --output json complete t-001"), ["ticketDone"]);
  for (const command of ["echo archive_plan.sh plan.md", "cat features_yaml.sh complete", "features_yaml.sh update t-001 --json {}", "grep complete features_yaml.sh"]) {
    assert.deepEqual(closeoutKinds(command), [], command);
  }
});

test("set_orchestration validates bounds and each call replaces the snapshot", () => {
  const ticket = (id, state, extra = {}) => ({ id, state, ...extra });
  const first = setOrchestration(undefined, { doing: " Running  2 ", tickets: [ticket("A-001", "running", { step: "execute", gates: 1 }), ticket("a-002", "committed", { commit: "A1B2C3D" })] }, "call-1");
  assert.deepEqual(first, { doing: "Running 2", tickets: [{ id: "a-001", state: "running", step: "execute", gates: 1 }, { id: "a-002", state: "committed", commit: "a1b2c3d" }] });
  const second = setOrchestration(first, { tickets: [ticket("a-003", "queued")] }, "call-2");
  assert.deepEqual(second, { tickets: [{ id: "a-003", state: "queued" }] });
  assert.equal(setOrchestration(second, { tickets: [] }, "call-3"), undefined);
  const many = Array.from({ length: 25 }, (_, index) => ticket(`a-${String(index + 1).padStart(3, "0")}`, "queued"));
  for (const [input, error] of [
    [{ tickets: many }, /At most 24/],
    [{ tickets: [ticket("nope", "queued")] }, /id like/],
    [{ tickets: [ticket("a-001", "done")] }, /state must be/],
    [{ tickets: [ticket("a-001", "running", { step: "build" })] }, /step must be/],
    [{ tickets: [ticket("a-001", "parked", { note: "x".repeat(81) })] }, /note must be 1–80/],
    [{ tickets: [ticket("a-001", "committed", { commit: "main" })] }, /short hash/],
    [{ tickets: [ticket("a-001", "running", { gates: -1 })] }, /gates must be/],
    [{ tickets: [ticket("a-001", "queued"), ticket("A-001", "queued")] }, /repeats/],
  ]) assert.throws(() => setOrchestration(first, input, "bad"), error);
  assert.equal(setOrchestration(undefined, { tickets: many.slice(0, 24) }, "max").tickets.length, 24);
});

test("an epic orchestration lens counts commits and windows 24 tickets to 12 open-first items", () => {
  const states = ["committed", "committed", "running", "gated", "parked", ...Array(19).fill("queued")];
  const tickets = states.map((state, index) => ({ id: `e-${String(index + 1).padStart(3, "0")}`, state, ...(state === "committed" ? { commit: "abc1234" } : {}),
    ...(state === "running" ? { step: "execute" } : state === "gated" ? { step: "review" } : {}), ...(state === "parked" ? { note: "Which CDN?" } : {}) }));
  const orchestration = setOrchestration(undefined, { doing: "Running 2 tickets", tickets }, "seed");
  const entry = withWorkflowDefinition({ orchestration });
  assert.equal(entry.activeStep, undefined);
  assert.equal(entry.heldStep, undefined);
  assert.deepEqual(entry.lens.progress, { completed: 2, total: 24, unit: "committed" });
  assert.equal(entry.lens.summary, "2 running · 1 parked · 19 queued");
  assert.equal(entry.lens.stages, undefined);
  const list = entry.lens.list;
  assert.equal(list.label, "TIX");
  assert.equal(list.items.length, 12);
  assert.deepEqual(list.items.slice(0, 3), [
    { state: "active", text: "e-003  EX" }, { state: "active", text: "e-004  RV" }, { state: "attention", text: "e-005  parked" },
  ]);
  assert.deepEqual(list.items[3], { state: "pending", text: "e-006  queued" });
  // The two commits are hidden behind the open and queued tickets and counted as earlier.
  assert.equal(list.before, 2);
  assert.equal(list.after, 10);
  const small = withWorkflowDefinition({ orchestration: setOrchestration(undefined, { tickets: tickets.slice(0, 6), pr: "#12 draft" }, "seed") }).lens.list;
  assert.deepEqual(small.items.map((item) => item.text), ["e-001  committed  abc1234", "e-002  committed  abc1234", "e-003  EX", "e-004  RV", "e-005  parked", "e-006  queued"]);
  assert.equal(small.head, "PR #12 draft");
  assert.deepEqual(parkedAttention(orchestration), { requestId: orchestration.tickets[4].requestId, kind: "blocked", text: "e-005 parked · Which CDN?" });
});

test("a single-ticket orchestration lens shows the runner's rail with explicit gates", () => {
  const lens = (ticket) => withWorkflowDefinition({ orchestration: setOrchestration(undefined, { doing: "Waiting for review", tickets: [ticket] }, "seed") }).lens;
  const running = lens({ id: "w-002", state: "running", step: "review", gates: 2 });
  assert.deepEqual(running, {
    doing: "Waiting for review",
    stages: [{ label: "PL", state: "done" }, { label: "EX", state: "done" }, { label: "RV", state: "active" }, { label: "RF", state: "pending" }, { label: "CM", state: "pending" }],
    summary: "2 gates ✓",
  });
  assert.equal(lens({ id: "w-002", state: "parked", step: "execute", gates: 1, note: "Which?" }).summary, "1 gate ✓ · parked");
  assert.equal(lens({ id: "w-002", state: "running", step: "execute" }).summary, undefined);
  assert.ok(lens({ id: "w-002", state: "committed", commit: "abc1234" }).stages.every((stage) => stage.state === "done"));
});

test("an active incomplete parent step keeps its own lens; a completed one yields to orchestration", () => {
  const orchestration = setOrchestration(undefined, { doing: "Running", tickets: [{ id: "o-001", state: "running", step: "execute" }, { id: "o-002", state: "queued" }] }, "seed");
  const planning = withWorkflowDefinition({ activeStep: "plan-md", activity: { id: "writing-plan", label: "Writing plan" }, orchestration });
  assert.equal(planning.activeStep, "plan-md");
  assert.equal(planning.lens.doing, "Writing plan");
  const ready = withWorkflowDefinition(setWorkflowActivity({ ...startWorkflowStep({ orchestration }, "plan-md") }, "plan-ready"));
  assert.equal(ready.activeStep, undefined);
  assert.equal(ready.heldStep, "plan-md");
  assert.equal(ready.lens.doing, "Running");
  assert.deepEqual(ready.orchestration, orchestration);
});

test("a parked episode keeps its question when omitted and its request stays within the attention bound", () => {
  const first = setOrchestration(undefined, { tickets: [{ id: "p-001", state: "parked", note: "Which CDN?" }] }, "a");
  const again = setOrchestration(first, { tickets: [{ id: "p-001", state: "parked", step: "execute" }] }, "b");
  assert.equal(again.tickets[0].note, "Which CDN?");
  assert.deepEqual(parkedAttention(again), parkedAttention(first));
  const resumed = setOrchestration(again, { tickets: [{ id: "p-001", state: "running" }] }, "c");
  assert.equal(resumed.tickets[0].note, undefined);
  assert.equal(parkedAttention(resumed), undefined);
  const id = (n) => `${"a".repeat(76)}-${String(n).padStart(3, "0")}`;
  const long = setOrchestration(undefined, { tickets: [1, 2].map((n) => ({ id: id(n), state: "parked", note: "n".repeat(80) })) }, "d");
  const text = parkedAttention(long).text;
  assert.equal([...text].length, 150);
  assert.match(text, /^a{76}-001 parked · n+ \(\+1 more\)$/);
});
