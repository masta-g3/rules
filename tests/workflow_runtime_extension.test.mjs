import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import workflowRuntime from "../extensions/workflow-runtime/index.ts";
import { PlanWidget } from "../extensions/workflow-runtime/plan-widget.ts";
import { createSessionModelCall, resolveSessionModels } from "../extensions/workflow-runtime/session-model.ts";
import { TodoPanel } from "../extensions/workflow-runtime/todo-panel.ts";

function harness(cwd, initialBranch = [], initialName, modelCall, readBinding) {
  const handlers = new Map();
  const commands = new Map();
  const shortcuts = new Map();
  const tools = new Map();
  const branch = structuredClone(initialBranch);
  const operations = [];
  const statuses = new Map();
  const widgets = new Map();
  let name = initialName;
  const ui = {
    theme: { fg: (_token, text) => text, bg: (_token, text) => text, bold: (text) => text },
    setWidget(id, factory) { if (factory) widgets.set(id, factory); else widgets.delete(id); },
    setStatus(id, text) {
      if (text === undefined) statuses.delete(id); else statuses.set(id, text);
      operations.push({ kind: "status", id, text });
    },
    notify(message, level) { operations.push({ kind: "notify", message, level }); },
    getEditorText() { return ""; },
    async custom() { operations.push({ kind: "custom" }); },
  };
  const ctx = {
    cwd,
    hasUI: true,
    mode: "tui",
    ui,
    model: undefined,
    modelRegistry: {
      find() { return undefined; },
      async getApiKeyAndHeaders() { return { ok: false }; },
    },
    sessionManager: {
      getBranch() { return branch; },
      getEntries() { return branch; },
    },
    isIdle() { return true; },
  };
  const pi = {
    registerMessageRenderer() {},
    registerCommand(id, definition) { commands.set(id, definition); },
    registerShortcut(id, definition) { shortcuts.set(String(id), definition); },
    registerTool(definition) { tools.set(definition.name, definition); },
    on(event, handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    appendEntry(customType, data) {
      branch.push({ type: "custom", customType, data });
      operations.push({ kind: "append", customType, data });
    },
    setSessionName(value) { name = value; operations.push({ kind: "name", value }); },
    getSessionName() { return name; },
    sendMessage(message, options) { operations.push({ kind: "send-message", message, options }); },
    sendUserMessage(message) { operations.push({ kind: "send-user", message }); },
    events: { on() {}, emit() {} },
  };
  workflowRuntime(pi, modelCall || readBinding ? { ...(modelCall ? { modelCall } : {}), ...(readBinding ? { readBinding } : {}) } : undefined);
  return {
    branch,
    commands,
    shortcuts,
    tools,
    operations,
    ctx,
    get name() { return name; },
    status(id) { return statuses.get(id); },
    externalName(value) { name = value; },
    async emit(event, payload = {}) {
      let result;
      for (const handler of handlers.get(event) ?? []) result = await handler(payload, ctx);
      return result;
    },
    latest(type) {
      return [...branch].reverse().find((entry) => entry.type === "custom" && entry.customType === type)?.data;
    },
    renderWorkflow(width) {
      return widgets.get("workflow-runtime")?.({ requestRender() {} }, ui.theme).render(width)[0];
    },
  };
}

function metadataSuccess(text, model = "test-model", latencyMs = 1) {
  return {
    outcome: "success",
    text,
    model,
    latencyMs,
    attempts: [{ model, latencyMs, outcome: "success" }],
    skippedModels: [],
  };
}

function delayedModel() {
  const calls = [];
  return {
    calls,
    call(_ctx, prompt, input) {
      return new Promise((resolve, reject) => calls.push({
        prompt,
        input,
        resolve(value) {
          Promise.resolve(value).then(
            (result) => resolve(typeof result === "string" ? metadataSuccess(result) : result),
            reject,
          );
        },
      }));
    },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

async function project() {
  const cwd = await mkdtemp(join(tmpdir(), "rules-runtime-"));
  await mkdir(join(cwd, "agent-work/plans"), { recursive: true });
  await writeFile(join(cwd, "agent-work/features.yaml"), `- id: meta-001\n  status: pending\n  title: Metadata redesign\n  subtitle: Simplify cross package session context\n  description: User can rely on one\n    context.\n  priority: 1\n  created_at: 2026-08-02\n  plan_file: agent-work/plans/meta-001.md\n- id: other-001\n  status: pending\n  title: Other ticket\n  subtitle: Exercise ticket switching without stale progress\n  description: User can switch tickets without stale plan data.\n  priority: 2\n  created_at: 2026-08-02\n`);
  await writeFile(join(cwd, "agent-work/plans/meta-001.md"), "### Phase 1: Foundation\n- [ ] Add contract\n");
  return cwd;
}

const FORK_COMPACT_ENV = "PI_AGENT_HUB_FORK_COMPACT";
const RESET_CAPABILITY = Symbol.for("pi-agent-hub.workflow-reset.v1");

async function withForkCompactAttempt(attemptId, run) {
  const previous = process.env[FORK_COMPACT_ENV];
  process.env[FORK_COMPACT_ENV] = attemptId;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env[FORK_COMPACT_ENV];
    else process.env[FORK_COMPACT_ENV] = previous;
    delete globalThis[RESET_CAPABILITY];
  }
}

test("compact-fork startup clears inherited producer state before its exact receipt", async () => {
  const cwd = await project();
  const attemptId = "4ebbf00d-35f9-49a2-b513-a79b3432e402";
  try {
    await withForkCompactAttempt(attemptId, async () => {
      const runtime = harness(cwd, [
        { type: "custom", customType: "workflow-runtime", data: {
          activeStep: "execute", ticketId: "meta-001", currentStepComplete: true,
          activity: { id: "implementation", label: "Implementing" },
          plan: { tasks: { completed: 1, total: 2 } },
          execution: { mode: "focus", scope: "execute", runId: "old-run", turnsCompleted: 2 },
        } },
        { type: "custom", customType: "pi-agent-hub-context", data: {
          version: 1, updatedAt: 10,
          ticket: { id: "meta-001", subtitle: "Old task", description: "Old description" },
          attention: { kind: "blocked", text: "Old blocker" },
          worktree: { version: 1, recordId: "old-record", producer: "rules", revision: 4, updatedAt: 10, repositories: [
            { sourcePath: cwd, worktreePath: join(cwd, "old-worktree"), branch: "old", role: "primary", state: "active" },
          ] },
        } },
      ], "Metadata redesign");

      assert.equal(process.env[FORK_COMPACT_ENV], attemptId);
      assert.equal(globalThis[RESET_CAPABILITY]?.version, 1);
      // Another extension may consume the shared launch marker in its startup handler first.
      delete process.env[FORK_COMPACT_ENV];
      await runtime.emit("session_start", { reason: "startup" });

      assert.equal(process.env[FORK_COMPACT_ENV], undefined);
      assert.equal(runtime.latest("workflow-runtime").activeStep, undefined);
      assert.equal(runtime.latest("workflow-runtime").ticketId, undefined);
      assert.equal(runtime.latest("workflow-runtime").execution, undefined);
      assert.equal(runtime.latest("workflow-runtime").plan, undefined);
      assert.equal(runtime.latest("pi-agent-hub-context").ticket, undefined);
      assert.equal(runtime.latest("pi-agent-hub-context").attention, undefined);
      assert.deepEqual(runtime.latest("pi-agent-hub-context").worktree, {
        version: 1, recordId: "old-record", producer: "rules", revision: 5, updatedAt: runtime.latest("pi-agent-hub-context").worktree.updatedAt, cleared: true,
      });
      assert.deepEqual(runtime.latest("workflow-runtime-reset"), { version: 1, id: attemptId, status: "ready" });
      const resetAppends = runtime.operations.filter((item) => item.kind === "append").slice(-3);
      assert.deepEqual(resetAppends.map((item) => item.customType), [
        "pi-agent-hub-context", "workflow-runtime", "workflow-runtime-reset",
      ]);
      assert.equal(runtime.name, "Metadata redesign");

      const receiptCount = runtime.branch.filter((entry) => entry.customType === "workflow-runtime-reset").length;
      await runtime.emit("session_start", { reason: "resume" });
      assert.equal(runtime.branch.filter((entry) => entry.customType === "workflow-runtime-reset").length, receiptCount);
      await runtime.emit("session_shutdown", { reason: "quit" });
      assert.equal(globalThis[RESET_CAPABILITY], undefined);
    });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("Hub boolean compact-fork startup releases the inherited ticket name", async () => {
  const cwd = await project();
  try {
    await withForkCompactAttempt("1", async () => {
      const runtime = harness(cwd, [
        { type: "custom", customType: "workflow-runtime", data: { activeStep: "execute", ticketId: "meta-001" } },
        { type: "custom", customType: "pi-agent-hub-context", data: { version: 1, updatedAt: 10, ticket: { id: "meta-001" } } },
      ], "Metadata redesign");
      delete process.env[FORK_COMPACT_ENV];
      await runtime.emit("session_start", { reason: "startup" });
      assert.equal(runtime.latest("workflow-runtime").ticketId, undefined);
      assert.equal(runtime.latest("pi-agent-hub-context").ticket, undefined);
      assert.equal(runtime.latest("workflow-runtime-reset"), undefined);
      await runtime.tools.get("set_session_name").execute("name", { name: "Fork discussion" });
      await runtime.emit("session_start", { reason: "reload" });
      assert.equal(runtime.latest("pi-agent-hub-context").ticket, undefined);
      assert.equal(runtime.name, "Fork discussion");
    });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("compact-fork startup rejects malformed and oversized attempt tokens", async () => {
  const cwd = await project();
  try {
    for (const token of ["0", "bad token has spaces", "x".repeat(81)]) {
      await withForkCompactAttempt(token, async () => {
        const runtime = harness(cwd, [{ type: "custom", customType: "workflow-runtime", data: { activeStep: "execute", ticketId: "meta-001" } }]);
        await runtime.emit("session_start", { reason: "startup" });
        assert.equal(runtime.latest("workflow-runtime-reset"), undefined);
        await runtime.emit("session_shutdown", { reason: "quit" });
      });
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("compact-fork reset rejects stale asynchronous metadata results", async () => {
  const cwd = await project();
  const delayed = delayedModel();
  try {
    await withForkCompactAttempt("f32fc683-cf3d-4af0-b97a-02d02ba09999", async () => {
      const runtime = harness(cwd, [], undefined, delayed.call);
      await runtime.emit("input", { source: "interactive", text: "Please name this session." });
      assert.equal(delayed.calls.length, 1);

      await runtime.emit("session_start", { reason: "startup" });
      delayed.calls[0].resolve("Stale inherited name");
      await settle();

      assert.equal(runtime.name, undefined);
      assert.equal(runtime.latest("pi-agent-hub-context").ticket, undefined);
      assert.equal(runtime.latest("pi-agent-hub-context").attention, undefined);
      assert.equal(runtime.latest("workflow-runtime").execution, undefined);
    });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("native fork publishes a lifecycle tombstone", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [
      { type: "custom", customType: "workflow-runtime", data: { activeStep: "execute", ticketId: "meta-001", worktreeRecord: join(cwd, "record.json") } },
      { type: "custom", customType: "pi-agent-hub-context", data: { version: 1, updatedAt: 2, ticket: { id: "meta-001" }, worktree: {
        version: 1, recordId: "fork-record", producer: "rules", revision: 3, updatedAt: 2,
        repositories: [{ sourcePath: cwd, worktreePath: join(cwd, "task"), branch: "task", role: "primary", state: "active" }],
      } } },
    ]);
    await runtime.emit("session_start", { reason: "fork" });
    assert.deepEqual(runtime.latest("pi-agent-hub-context").worktree, {
      version: 1, recordId: "fork-record", producer: "rules", revision: 4,
      updatedAt: runtime.latest("pi-agent-hub-context").worktree.updatedAt, cleared: true,
    });
    assert.equal(runtime.latest("workflow-runtime").worktreeRecord, undefined);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("native fork cleanup rejects stale asynchronous metadata and survives resume", async () => {
  const cwd = await project();
  const delayed = delayedModel();
  try {
    const runtime = harness(cwd, [], undefined, delayed.call);
    await runtime.emit("input", { source: "interactive", text: "Name inherited work" });
    await runtime.emit("session_start", { reason: "fork" });
    delayed.calls[0].resolve("Stale inherited name");
    await settle();
    assert.equal(runtime.name, undefined);
    assert.equal(runtime.latest("workflow-runtime").ticketId, undefined);
    assert.equal(runtime.latest("pi-agent-hub-context").ticket, undefined);

    const resumed = harness(cwd, runtime.branch, "Fork discussion");
    await resumed.emit("session_start", { reason: "resume" });
    resumed.externalName("Native fork rename");
    await resumed.emit("session_info_changed", { name: "Native fork rename" });
    await resumed.tools.get("set_session_name").execute("name", { name: "Agent fork rename" });
    assert.equal(resumed.name, "Agent fork rename");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("failed reset receipt cannot reuse its launch token on another session boundary", async () => {
  const cwd = await project();
  try {
    await withForkCompactAttempt("f32fc683-cf3d-4af0-b97a-02d02ba09998", async () => {
      const runtime = harness(cwd);
      const append = runtime.branch.push;
      runtime.branch.push = function(entry) {
        if (entry.customType === "workflow-runtime-reset") throw new Error("receipt write failed");
        return append.call(this, entry);
      };
      await assert.rejects(() => runtime.emit("session_start", { reason: "startup" }), /receipt write failed/);
      runtime.branch.push = append;
      runtime.branch.push({ type: "custom", customType: "workflow-runtime", data: { activeStep: "review", ticketId: "other-001" } });
      await runtime.emit("session_start", { reason: "resume" });
      assert.equal(runtime.latest("workflow-runtime").ticketId, "other-001");
      assert.equal(runtime.latest("workflow-runtime-reset"), undefined);
      await runtime.emit("session_shutdown", { reason: "quit" });
    });
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("capability cleanup respects a later producer registration", async () => {
  const cwd = await project();
  try {
    const first = harness(cwd);
    const firstCapability = globalThis[RESET_CAPABILITY];
    const second = harness(cwd);
    const secondCapability = globalThis[RESET_CAPABILITY];
    assert.notEqual(firstCapability, secondCapability);
    await first.emit("session_shutdown", { reason: "quit" });
    assert.equal(globalThis[RESET_CAPABILITY], secondCapability);
    await second.emit("session_shutdown", { reason: "quit" });
    assert.equal(globalThis[RESET_CAPABILITY], undefined);
  } finally {
    delete globalThis[RESET_CAPABILITY];
    await rm(cwd, { recursive: true, force: true });
  }
});

test("plan widget and todo drawer remain bounded and read only", () => {
  const theme = { fg: (_token, text) => text, bold: (text) => text };
  const projection = { phase: { index: 1, count: 2, title: "Foundation" }, tasks: { completed: 1, total: 3 }, nextStep: "Add tests" };
  const widget = new PlanWidget(theme, projection);
  assert.ok(widget.render(60).every((line) => line.length <= 60));
  assert.equal(widget.render(10).length, 1);

  let closed = 0;
  let renders = 0;
  const panel = new TodoPanel(
    { terminal: { rows: 20 }, requestRender() { renders += 1; } },
    theme,
    "meta-001",
    { sections: [{ heading: "Phase 1 · Foundation", tasks: [{ done: true, text: "Add contract" }, { done: false, text: "Add tests" }] }], completed: 1, total: 2, currentSectionIndex: 0 },
    () => { closed += 1; },
  );
  assert.ok(panel.render(40).some((line) => line.includes("Add tests")));
  panel.handleInput("\u001b");
  assert.equal(closed, 1);
  assert.equal(renders, 0);
});

test("runtime registers commands, shortcuts, and guarded producer tools", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [], "Existing");
    assert.deepEqual([...runtime.commands.keys()].sort(), ["session-metadata-disable", "session-metadata-enable", "session-metadata-status", "session-name", "wf-clear", "wf-ticket", "wf-todos"]);
    assert.ok(runtime.shortcuts.has("ctrl+shift+right"));
    assert.equal(runtime.shortcuts.size, 2);
    for (const tool of ["set_session_name", "set_workflow_activity", "set_workflow_ticket", "complete_workflow"]) assert.ok(runtime.tools.has(tool));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("workflow clear commands durably unlink the right projection and release naming", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd);
    const ticketBytes = await readFile(join(cwd, "agent-work/features.yaml"));
    const planBytes = await readFile(join(cwd, "agent-work/plans/meta-001.md"));
    await runtime.emit("input", { source: "interactive", text: "/skill:review meta-001" });
    await runtime.tools.get("set_workflow_activity").execute("activity", { activityId: "reviewing-implementation" }, undefined, undefined, runtime.ctx);
    await runtime.tools.get("set_workflow_activity").execute("activity", { activityId: "review-complete" }, undefined, undefined, runtime.ctx);
    await runtime.emit("tool_execution_start", { toolName: "ask_user_question", toolCallId: "old-question", args: { questions: [{ question: "Old question?" }] } });

    const beforeMalformed = runtime.branch.length;
    await runtime.commands.get("wf-ticket").handler(" clear extra ", runtime.ctx);
    assert.equal(runtime.branch.length, beforeMalformed);
    assert.match(runtime.operations.at(-1).message, /Usage: \/wf-ticket <ticket-id> \[absolute-worktree-record] \| clear/);

    await runtime.commands.get("wf-ticket").handler(" clear ", runtime.ctx);
    const unlinked = runtime.latest("workflow-runtime");
    assert.equal(unlinked.activeStep, "review");
    assert.deepEqual(unlinked.activity, { id: "review-complete", label: "Review complete" });
    assert.equal(unlinked.currentStepComplete, true);
    assert.deepEqual(unlinked.activityPasses, { "reviewing-implementation": 1 });
    assert.equal(unlinked.ticketId, undefined);
    assert.equal(unlinked.plan, undefined);
    assert.equal(unlinked.execution, undefined);
    assert.equal(runtime.latest("pi-agent-hub-context").ticket, undefined);
    assert.equal(runtime.latest("pi-agent-hub-context").attention, undefined);
    assert.equal(runtime.name, "Metadata redesign");
    await runtime.tools.get("set_session_name").execute("name", { name: "Free discussion" });
    runtime.externalName("Native rename");
    await runtime.emit("session_info_changed", { name: "Native rename" });
    assert.equal(runtime.name, "Native rename");

    await runtime.emit("input", { source: "interactive", text: "/skill:execute meta-001" });
    await runtime.tools.get("start_focus").execute("focus", {}, undefined, undefined, runtime.ctx);
    await runtime.commands.get("wf-ticket").handler("clear", runtime.ctx);
    assert.equal(runtime.latest("workflow-runtime").activeStep, "execute");
    assert.equal(runtime.latest("workflow-runtime").execution, undefined);
    await runtime.commands.get("wf-ticket").handler("clear", runtime.ctx);
    assert.equal(runtime.latest("workflow-runtime").activeStep, "execute");
    await runtime.commands.get("session-metadata-disable").handler("", runtime.ctx);
    await runtime.commands.get("wf-clear").handler("", runtime.ctx);
    assert.equal(runtime.latest("workflow-runtime").activeStep, undefined);
    assert.match(runtime.renderWorkflow(80), /◇– meta/);
    assert.equal(runtime.latest("pi-agent-hub-context").ticket, undefined);

    await runtime.emit("session_compact", { reason: "manual", willRetry: false });
    await runtime.emit("session_shutdown", { reason: "quit" });
    const resumed = harness(cwd, runtime.branch, runtime.name);
    await resumed.emit("session_start", { reason: "resume" });
    assert.equal(resumed.latest("workflow-runtime").ticketId, undefined);
    assert.equal(resumed.latest("pi-agent-hub-context").ticket, undefined);
    await resumed.tools.get("set_session_name").execute("name", { name: "After reload" });
    await resumed.commands.get("wf-ticket").handler("other-001", resumed.ctx);
    await assert.rejects(resumed.tools.get("set_session_name").execute("name", { name: "Blocked" }), /other-001.*ticket title/i);
    await resumed.commands.get("wf-clear").handler("", resumed.ctx);
    assert.equal(resumed.latest("workflow-runtime").ticketId, undefined);
    assert.equal(resumed.latest("pi-agent-hub-context").ticket, undefined);
    await resumed.tools.get("set_session_name").execute("name", { name: "Full reset rename" });
    assert.deepEqual(await readFile(join(cwd, "agent-work/features.yaml")), ticketBytes);
    assert.deepEqual(await readFile(join(cwd, "agent-work/plans/meta-001.md")), planBytes);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("unlink invalidates stale naming, attention, and deferred workflow input", async () => {
  const cwd = await project();
  const delayed = delayedModel();
  try {
    const runtime = harness(cwd, [], undefined, delayed.call);
    await runtime.emit("input", { source: "interactive", text: "Name the old task" });
    assert.equal(delayed.calls.length, 1);
    await runtime.emit("input", { source: "interactive", text: "/skill:review meta-001", streamingBehavior: "followUp" });
    await runtime.commands.get("wf-clear").handler("", runtime.ctx);
    await runtime.emit("message_start", { message: { role: "user", content: "/skill:review meta-001" } });
    delayed.calls[0].resolve("Stale old name");
    await settle();
    assert.equal(runtime.name, undefined);
    assert.equal(runtime.latest("workflow-runtime").activeStep, undefined);
    assert.equal(runtime.latest("pi-agent-hub-context").ticket, undefined);

    const selecting = harness(cwd);
    const pendingSelection = selecting.commands.get("wf-ticket").handler("meta-001", selecting.ctx);
    await selecting.commands.get("wf-ticket").handler("clear", selecting.ctx);
    await pendingSelection;
    assert.equal(selecting.latest("workflow-runtime").ticketId, undefined);
    assert.equal(selecting.latest("pi-agent-hub-context").ticket, undefined);
    assert.equal(selecting.name, undefined);

    const attention = delayedModel();
    const linked = harness(cwd, [], "Existing", attention.call);
    await linked.commands.get("wf-ticket").handler("meta-001", linked.ctx);
    await linked.emit("input", { source: "interactive", text: "Finish old work" });
    const ending = linked.emit("agent_end", { messages: [{ role: "assistant", stopReason: "stop", content: "Ready for review." }] });
    await ending;
    await settle();
    assert.equal(attention.calls.length, 1);
    await linked.commands.get("wf-ticket").handler("clear", linked.ctx);
    attention.calls[0].resolve('{"kind":"ready","text":"Stale attention","confidence":0.9}');
    await settle();
    assert.equal(linked.latest("pi-agent-hub-context").ticket, undefined);
    assert.equal(linked.latest("pi-agent-hub-context").attention, undefined);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("clearing during a final plan read cannot restore progress or continue Focus", async () => {
  const cwd = await project();
  try {
    for (const command of ["wf-clear", "wf-ticket"]) {
      const runtime = harness(cwd);
      await runtime.emit("input", { source: "interactive", text: "/skill:execute meta-001" });
      await runtime.tools.get("start_focus").execute("focus", {}, undefined, undefined, runtime.ctx);
      const ending = runtime.emit("agent_end", { messages: [{ role: "assistant", stopReason: "stop", content: "Old task finished." }] });
      await runtime.commands.get(command).handler(command === "wf-ticket" ? "clear" : "", runtime.ctx);
      await ending;
      await settle();
      assert.equal(runtime.latest("workflow-runtime").plan, undefined);
      assert.equal(runtime.latest("workflow-runtime").execution, undefined);
      assert.equal(runtime.latest("pi-agent-hub-context").ticket, undefined);
      assert.equal(runtime.operations.filter((operation) => operation.kind === "send-message" || operation.kind === "send-user").length, 0);
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("a delayed binding read cannot publish after workflow clear", async () => {
  const cwd = await project();
  let resolveBinding;
  const readBinding = () => new Promise((resolve) => { resolveBinding = resolve; });
  const recordPath = join(cwd, "record.json");
  const snapshot = { version: 1, recordId: "stale-record", producer: "rules", revision: 2, updatedAt: 2, repositories: [
    { sourcePath: cwd, worktreePath: cwd, branch: "task", role: "primary", state: "active" },
  ] };
  try {
    const runtime = harness(cwd, [
      { type: "custom", customType: "workflow-runtime", data: { activeStep: "execute", ticketId: "meta-001", worktreeRecord: recordPath } },
      { type: "custom", customType: "pi-agent-hub-context", data: { version: 1, updatedAt: 2, ticket: { id: "meta-001" }, worktree: snapshot } },
    ], "Metadata redesign", undefined, readBinding);
    const starting = runtime.emit("session_start", { reason: "resume" });
    await settle();
    await runtime.commands.get("wf-clear").handler("", runtime.ctx);
    resolveBinding({ recordPath, recordId: "stale-record", ticket: "meta-001", authoredRoot: cwd, snapshot });
    await starting;
    assert.equal(runtime.latest("workflow-runtime").worktreeRecord, undefined);
    assert.equal(runtime.latest("pi-agent-hub-context").worktree.cleared, true);
    assert.equal(runtime.latest("pi-agent-hub-context").worktree.repositories, undefined);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("delayed command and tool binding validation cannot override a clear", async () => {
  const cwd = await project();
  const recordPath = join(cwd, "record.json");
  const snapshot = { version: 1, recordId: "validated-record", producer: "rules", revision: 1, updatedAt: 1, repositories: [
    { sourcePath: cwd, worktreePath: cwd, branch: "task", role: "primary", state: "active" },
  ] };
  try {
    for (const entryPoint of ["command", "tool"]) {
      let resolveBinding;
      const readBinding = () => new Promise((resolve) => { resolveBinding = resolve; });
      const runtime = harness(cwd, [], undefined, undefined, readBinding);
      const pending = entryPoint === "command"
        ? runtime.commands.get("wf-ticket").handler(`meta-001 ${recordPath}`, runtime.ctx)
        : runtime.tools.get("set_workflow_ticket").execute("ticket", { ticketId: "meta-001", worktreeRecord: recordPath }, undefined, undefined, runtime.ctx);
      await settle();
      await runtime.commands.get("wf-clear").handler("", runtime.ctx);
      resolveBinding({ recordPath, recordId: "validated-record", ticket: "meta-001", authoredRoot: cwd, snapshot });
      if (entryPoint === "tool") await assert.rejects(pending, /changed while.*validat/i);
      else await pending;
      assert.equal(runtime.latest("workflow-runtime").worktreeRecord, undefined);
      assert.equal(runtime.latest("workflow-runtime").ticketId, undefined);
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("explicit worktree binding owns ticket and plan refresh across resume", async () => {
  const source = await project();
  const bound = await project();
  const records = await mkdtemp(join(tmpdir(), "rules-record-"));
  const recordPath = join(records, "worktree.json");
  try {
    await writeFile(join(source, "agent-work/plans/meta-001.md"), "### Phase 1: Source\n- [ ] old\n");
    await writeFile(join(bound, "agent-work/plans/meta-001.md"), "### Phase 1: Bound\n- [x] one\n- [x] two\n");
    const record = {
      version: 1, id: "task-record", revision: 1, owner: "rules", ticket: "meta-001", recordPath,
      primaryRepository: "app", authoredRoot: bound, state: "active", updatedAt: new Date().toISOString(),
      repositories: [{ label: "app", source, worktree: bound, branch: "task", role: "primary", state: "active" }],
    };
    await writeFile(recordPath, JSON.stringify(record));
    const runtime = harness(source);
    await runtime.tools.get("set_workflow_ticket").execute("ticket", { ticketId: "meta-001", worktreeRecord: recordPath }, undefined, undefined, runtime.ctx);
    await runtime.emit("input", { source: "interactive", text: "/skill:execute meta-001" });
    assert.deepEqual(runtime.latest("workflow-runtime").plan.tasks, { completed: 2, total: 2 });
    assert.equal(runtime.latest("workflow-runtime").worktreeRecord, recordPath);
    assert.equal(runtime.latest("pi-agent-hub-context").worktree.recordId, "task-record");

    await mkdir(join(bound, "agent-work/history"), { recursive: true });
    await writeFile(join(bound, "agent-work/history/meta-001.md"), "### Phase 1: Archived\n- [x] one\n- [x] two\n- [x] three\n");
    const yaml = await readFile(join(bound, "agent-work/features.yaml"), "utf8");
    await writeFile(join(bound, "agent-work/features.yaml"), yaml.replace("agent-work/plans/meta-001.md", "agent-work/history/meta-001.md"));
    await rm(join(bound, "agent-work/plans/meta-001.md"));
    await runtime.emit("tool_execution_end", { toolName: "edit" });
    assert.deepEqual(runtime.latest("workflow-runtime").plan.tasks, { completed: 3, total: 3 });

    const resumed = harness(source, runtime.branch, runtime.name);
    await resumed.emit("session_start", { reason: "resume" });
    assert.equal(resumed.latest("workflow-runtime").worktreeRecord, recordPath);
    assert.deepEqual(resumed.latest("workflow-runtime").plan.tasks, { completed: 3, total: 3 });

    const archivedPlan = join(bound, "agent-work/history/meta-001.md");
    await rm(archivedPlan);
    await resumed.emit("tool_execution_end", { toolName: "edit" });
    assert.equal(resumed.latest("workflow-runtime").plan, undefined);
    assert.equal(resumed.latest("pi-agent-hub-context").worktree.producer, "rules");
    assert.equal(resumed.latest("pi-agent-hub-context").worktree.revision, 2);
    assert.equal(resumed.latest("pi-agent-hub-context").worktree.repositories[0].state, "check-needed");

    await writeFile(archivedPlan, "### Phase 1: Archived\n- [x] one\n- [x] two\n- [x] three\n");
    await resumed.emit("tool_execution_end", { toolName: "edit" });
    assert.equal(resumed.latest("pi-agent-hub-context").worktree.producer, "rules");
    assert.equal(resumed.latest("pi-agent-hub-context").worktree.revision, 3);
    assert.deepEqual(resumed.latest("workflow-runtime").plan.tasks, { completed: 3, total: 3 });

    const featuresPath = join(bound, "agent-work/features.yaml");
    const archivedYaml = await readFile(featuresPath, "utf8");
    await rm(featuresPath);
    await resumed.emit("tool_execution_end", { toolName: "edit" });
    assert.equal(resumed.latest("workflow-runtime").plan, undefined);
    assert.equal(resumed.latest("pi-agent-hub-context").worktree.producer, "rules");
    assert.equal(resumed.latest("pi-agent-hub-context").worktree.revision, 4);
    assert.match(resumed.latest("pi-agent-hub-context").worktree.repositories[0].issue, /ticket/);
    await writeFile(featuresPath, archivedYaml);
    await resumed.emit("tool_execution_end", { toolName: "edit" });
    assert.equal(resumed.latest("pi-agent-hub-context").worktree.producer, "rules");
    assert.equal(resumed.latest("pi-agent-hub-context").worktree.revision, 5);

    await rm(recordPath);
    await resumed.emit("tool_execution_end", { toolName: "edit" });
    assert.equal(resumed.latest("workflow-runtime").plan, undefined);
    assert.equal(resumed.latest("pi-agent-hub-context").worktree.producer, "rules");
    assert.equal(resumed.latest("pi-agent-hub-context").worktree.revision, 6);
    assert.equal(resumed.latest("pi-agent-hub-context").worktree.repositories[0].state, "check-needed");

    await writeFile(recordPath, JSON.stringify(record));
    await resumed.emit("tool_execution_end", { toolName: "edit" });
    assert.equal(resumed.latest("pi-agent-hub-context").worktree.revision, 7);
    assert.equal(resumed.latest("pi-agent-hub-context").worktree.repositories[0].state, "active");
    await resumed.commands.get("wf-clear").handler("", resumed.ctx);
    assert.equal(resumed.latest("workflow-runtime").worktreeRecord, undefined);
    assert.equal(resumed.latest("pi-agent-hub-context").worktree.cleared, true);
    assert.equal(resumed.latest("pi-agent-hub-context").worktree.producer, "rules");
    assert.equal(resumed.latest("pi-agent-hub-context").worktree.revision, 8);
    assert.ok(record.revision < resumed.latest("pi-agent-hub-context").worktree.revision);
  } finally {
    await rm(source, { recursive: true, force: true });
    await rm(bound, { recursive: true, force: true });
    await rm(records, { recursive: true, force: true });
  }
});

test("ticket context precedes native name, ordinary turns stay stable, and plan refreshes", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd);
    await runtime.emit("session_start", { reason: "new" });
    await runtime.commands.get("wf-ticket").handler("meta-001", runtime.ctx);
    const contextIndex = runtime.operations.findIndex((item) => item.kind === "append" && item.customType === "pi-agent-hub-context");
    const nameIndex = runtime.operations.findIndex((item) => item.kind === "name");
    assert.ok(contextIndex >= 0 && nameIndex > contextIndex);
    assert.equal(runtime.name, "Metadata redesign");
    assert.deepEqual(runtime.latest("pi-agent-hub-context").ticket, { id: "meta-001", subtitle: "Simplify cross package session context", description: "User can rely on one context." });

    const names = runtime.operations.filter((item) => item.kind === "name").length;
    await runtime.emit("input", { source: "interactive", text: "Please inspect the next file." });
    assert.equal(runtime.operations.filter((item) => item.kind === "name").length, names);

    await runtime.emit("input", { source: "interactive", text: "/skill:execute meta-001" });
    assert.deepEqual(runtime.latest("workflow-runtime").plan.tasks, { completed: 0, total: 1 });
    await writeFile(join(cwd, "agent-work/plans/meta-001.md"), "### Phase 1: Foundation\n- [x] Add contract\n- [ ] Add tests\n");
    await runtime.emit("tool_execution_end", { toolName: "edit" });
    assert.deepEqual(runtime.latest("workflow-runtime").plan.tasks, { completed: 1, total: 2 });
    assert.equal(runtime.latest("workflow-runtime").plan.nextStep, "Add tests");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("ticket names reject exact-name overrides and survive stage changes and refresh", async () => {
  const cwd = await project();
  const delayed = delayedModel();
  try {
    const runtime = harness(cwd, [], undefined, delayed.call);
    await runtime.tools.get("set_workflow_ticket").execute("ticket", { ticketId: "meta-001" }, undefined, undefined, runtime.ctx);
    await assert.rejects(runtime.tools.get("set_session_name").execute("name", { name: "Reviewing the implementation" }), /meta-001.*ticket title/i);
    assert.equal(runtime.name, "Metadata redesign");
    await runtime.tools.get("set_session_name").execute("name", { name: "Metadata redesign" });
    await runtime.emit("input", { source: "interactive", text: "/skill:review meta-001" });
    assert.equal(runtime.latest("workflow-runtime").activeStep, "review");
    assert.equal(runtime.name, "Metadata redesign");
    await runtime.commands.get("session-metadata-disable").handler("", runtime.ctx);
    await runtime.commands.get("session-name").handler("refresh", runtime.ctx);
    assert.equal(runtime.name, "Metadata redesign");
    assert.match(runtime.operations.at(-1).message, /refreshed from meta-001/);
    assert.equal(delayed.calls.length, 0);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("native and external rename events restore the linked title without repeated writes", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd);
    await runtime.commands.get("wf-ticket").handler("meta-001", runtime.ctx);
    const context = runtime.latest("pi-agent-hub-context");
    runtime.externalName("A different topic");
    await runtime.emit("session_info_changed", { name: "A different topic" });
    assert.equal(runtime.name, "Metadata redesign");
    const writes = runtime.operations.filter((operation) => operation.kind === "name").length;
    await runtime.emit("session_info_changed", { name: "Metadata redesign" });
    assert.equal(runtime.operations.filter((operation) => operation.kind === "name").length, writes);
    assert.deepEqual(runtime.latest("pi-agent-hub-context"), context);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("resume restores the ticket title even if a prior session renamed it", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [{ type: "custom", customType: "workflow-runtime", data: { activeStep: "execute", ticketId: "meta-001" } }], "Temporary stage name");
    await runtime.emit("session_start", { reason: "resume" });
    assert.equal(runtime.name, "Metadata redesign");
    await assert.rejects(runtime.tools.get("set_session_name").execute("name", { name: "Another stage" }), /ticket title/i);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("fork releases the child name and keeps the original ticket name protected", async () => {
  const cwd = await project();
  try {
    const original = harness(cwd);
    await original.commands.get("wf-ticket").handler("meta-001", original.ctx);
    const fork = harness(cwd, original.branch, original.name, async () => metadataSuccess("Different discussion"));
    await fork.emit("session_start", { reason: "fork" });
    assert.equal(fork.latest("pi-agent-hub-context").ticket, undefined);
    await fork.tools.get("set_session_name").execute("name", { name: "Side discussion" });
    assert.equal(fork.name, "Side discussion");
    fork.externalName("Manual discussion name");
    await fork.emit("session_info_changed", { name: "Manual discussion name" });
    assert.equal(fork.name, "Manual discussion name");
    fork.branch.push({ type: "message", message: { role: "user", content: "Discuss another approach" } });
    await fork.commands.get("session-name").handler("refresh", fork.ctx);
    assert.equal(fork.name, "Different Discussion");
    assert.equal(original.name, "Metadata redesign");
    await assert.rejects(original.tools.get("set_session_name").execute("name", { name: "Child name" }), /ticket title/i);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("command, tool, and skill ticket switches clear old progress before publication", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [], "Metadata redesign");
    await runtime.emit("input", { source: "interactive", text: "/skill:execute meta-001" });
    assert.ok(runtime.latest("workflow-runtime").plan);

    let start = runtime.branch.length;
    await runtime.commands.get("wf-ticket").handler("other-001", runtime.ctx);
    let switched = runtime.branch.slice(start).filter((entry) => entry.customType === "workflow-runtime" && entry.data.ticketId === "other-001");
    assert.ok(switched.length > 0);
    assert.ok(switched.every((entry) => entry.data.plan === undefined));

    start = runtime.branch.length;
    await runtime.tools.get("set_workflow_ticket").execute("switch", { ticketId: "meta-001" }, undefined, undefined, runtime.ctx);
    switched = runtime.branch.slice(start).filter((entry) => entry.customType === "workflow-runtime" && entry.data.ticketId === "meta-001");
    assert.ok(switched.length > 0);
    assert.equal(switched[0].data.plan, undefined);

    start = runtime.branch.length;
    await runtime.emit("input", { source: "interactive", text: "/skill:review other-001" });
    switched = runtime.branch.slice(start).filter((entry) => entry.customType === "workflow-runtime" && entry.data.ticketId === "other-001");
    assert.ok(switched.length > 0);
    assert.ok(switched.every((entry) => entry.data.plan === undefined));
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("focus ticket switches refresh canonical context, name, and plan", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [], "Metadata redesign");
    await runtime.emit("input", { source: "interactive", text: "/skill:execute meta-001" });
    assert.ok(runtime.latest("workflow-runtime").plan);

    await runtime.emit("input", { source: "interactive", text: "/skill:focus other-001" });
    assert.match(runtime.renderWorkflow(80), /^✓ Plan ─ [◇◆] Focus ─ · Review ─ · Reflect ─ · Commit/);
    assert.equal(runtime.latest("workflow-runtime").ticketId, "other-001");
    assert.equal(runtime.latest("workflow-runtime").plan, undefined);
    assert.equal(runtime.latest("pi-agent-hub-context").ticket.id, "other-001");
    assert.equal(runtime.name, "Other ticket");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("ticket switches cannot reopen a stale todo drawer", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [], "Metadata redesign");
    await runtime.emit("input", { source: "interactive", text: "/skill:review meta-001" });
    const opening = runtime.commands.get("wf-todos").handler("", runtime.ctx);
    await runtime.commands.get("wf-ticket").handler("other-001", runtime.ctx);
    await opening;
    assert.equal(runtime.operations.some((item) => item.kind === "custom"), false);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("resume preserves attention until new work clears it", async () => {
  const cwd = await project();
  try {
    const branch = [
      { type: "custom", customType: "workflow-runtime", data: { activeStep: "review", ticketId: "meta-001", steps: [
        { id: "plan-md", short: "PL", label: "Plan" }, { id: "execute", short: "EX", label: "Execute" }, { id: "review", short: "RV", label: "Review" }, { id: "reflect", short: "RF", label: "Reflect" }, { id: "commit", short: "CM", label: "Commit" },
      ] } },
      { type: "custom", customType: "pi-agent-hub-context", data: { version: 1, updatedAt: 10, ticket: { id: "meta-001", subtitle: "Simplify cross package session context", description: "User can rely on one context." }, attention: { kind: "ready", text: "Review the implementation" } } },
    ];
    const runtime = harness(cwd, branch, "Metadata redesign");
    await runtime.emit("session_start", { reason: "resume" });
    assert.deepEqual(runtime.latest("pi-agent-hub-context").attention, { kind: "ready", text: "Review the implementation" });
    await runtime.emit("before_agent_start", { systemPrompt: "base" });
    assert.equal(runtime.latest("pi-agent-hub-context").attention, undefined);
    assert.equal(runtime.latest("pi-agent-hub-context").ticket.id, "meta-001");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("ticket replacement and refresh cannot revive prior attention", async () => {
  const cwd = await project();
  try {
    const branch = [
      { type: "custom", customType: "workflow-runtime", data: { activeStep: "review", ticketId: "meta-001", steps: [
        { id: "plan-md", short: "PL", label: "Plan" }, { id: "execute", short: "EX", label: "Execute" }, { id: "review", short: "RV", label: "Review" }, { id: "reflect", short: "RF", label: "Reflect" }, { id: "commit", short: "CM", label: "Commit" },
      ] } },
      { type: "custom", customType: "pi-agent-hub-context", data: { version: 1, updatedAt: 10, ticket: { id: "meta-001" }, attention: { kind: "ready", text: "Review the old ticket" } } },
    ];
    const runtime = harness(cwd, branch, "Metadata redesign");
    await runtime.emit("session_start", { reason: "resume" });
    await runtime.commands.get("wf-ticket").handler("other-001", runtime.ctx);
    assert.equal(runtime.latest("pi-agent-hub-context").attention, undefined);
    await runtime.commands.get("session-name").handler("refresh", runtime.ctx);
    assert.equal(runtime.latest("pi-agent-hub-context").attention, undefined);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("a malformed newest context does not revive older attention", async () => {
  const cwd = await project();
  try {
    const branch = [
      { type: "custom", customType: "workflow-runtime", data: { activeStep: "review", ticketId: "meta-001", steps: [
        { id: "plan-md", short: "PL", label: "Plan" }, { id: "execute", short: "EX", label: "Execute" }, { id: "review", short: "RV", label: "Review" }, { id: "reflect", short: "RF", label: "Reflect" }, { id: "commit", short: "CM", label: "Commit" },
      ] } },
      { type: "custom", customType: "pi-agent-hub-context", data: { version: 1, updatedAt: 10, ticket: { id: "meta-001" }, attention: { kind: "blocked", text: "Resolve the stale blocker" } } },
      { type: "custom", customType: "pi-agent-hub-context", data: { version: 2, updatedAt: 11, attention: { kind: "blocked", text: "Malformed newest snapshot" } } },
    ];
    const runtime = harness(cwd, branch, "Metadata redesign");
    await runtime.emit("session_start", { reason: "resume" });
    assert.equal(runtime.latest("pi-agent-hub-context").attention, undefined);
    const contextsBeforeStart = runtime.branch.filter((entry) => entry.customType === "pi-agent-hub-context").length;
    await runtime.emit("before_agent_start", { systemPrompt: "base" });
    assert.equal(runtime.branch.filter((entry) => entry.customType === "pi-agent-hub-context").length, contextsBeforeStart);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("automatic naming is detached, survives its own turn start, and rejects exact-name changes", async () => {
  const cwd = await project();
  try {
    const delayed = delayedModel();
    const runtime = harness(cwd, [], undefined, delayed.call);
    await runtime.emit("input", { source: "interactive", text: "Implement metadata projection" });
    assert.equal(delayed.calls.length, 1);
    assert.equal(runtime.name, undefined);

    await runtime.emit("before_agent_start", { systemPrompt: "base" });
    delayed.calls[0].resolve("Metadata Projection");
    await settle();
    assert.equal(runtime.name, "Metadata Projection");

    const stale = delayedModel();
    const changed = harness(cwd, [], undefined, stale.call);
    await changed.emit("input", { source: "interactive", text: "Name this session" });
    await changed.tools.get("set_session_name").execute("name", { name: "Exact Name" });
    stale.calls[0].resolve("Stale Name");
    await settle();
    assert.equal(changed.name, "Exact Name");

    const external = delayedModel();
    const renamedOutsideRules = harness(cwd, [], undefined, external.call);
    await renamedOutsideRules.emit("input", { source: "interactive", text: "Name this outside Rules" });
    renamedOutsideRules.externalName("External Name");
    external.calls[0].resolve("Stale Generated Name");
    await settle();
    assert.equal(renamedOutsideRules.name, "External Name");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("title-less explicit tickets name from ticket and conversation context", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "workflow-titleless-"));
  try {
    await mkdir(join(cwd, "agent-work"), { recursive: true });
    await writeFile(join(cwd, "agent-work/features.yaml"), `- id: legacy-001\n  status: pending\n  subtitle: Preserve useful legacy ticket context\n  description: User can name a legacy ticket without an authored title.\n  priority: 1\n  created_at: 2026-08-04\n`);
    const delayed = delayedModel();
    const branch = Array.from({ length: 6 }, (_, index) => ({
      type: "message",
      message: {
        role: "user",
        content: `${index === 1 ? "SECOND_OLDEST" : `Message ${index}`} ${"x".repeat(550)} ${index === 5 ? "NEWEST_END" : "done"}`,
      },
    }));
    const runtime = harness(cwd, branch, "Existing Name", delayed.call);

    await runtime.commands.get("wf-ticket").handler("legacy-001", runtime.ctx);
    await settle();

    assert.equal(delayed.calls.length, 1);
    assert.match(delayed.calls[0].input, /legacy-001/);
    assert.match(delayed.calls[0].input, /Preserve useful legacy ticket context/);
    assert.match(delayed.calls[0].input, /User can name a legacy ticket without an authored title/);
    assert.doesNotMatch(delayed.calls[0].input, /SECOND_OLDEST/);
    assert.match(delayed.calls[0].input, /NEWEST_END/);
    delayed.calls[0].resolve("Legacy Metadata");
    await settle();
    assert.equal(runtime.name, "Legacy Metadata");
    await runtime.commands.get("session-name").handler("refresh", runtime.ctx);
    assert.equal(delayed.calls.length, 1);
    assert.equal(runtime.name, "Legacy Metadata");
    await assert.rejects(runtime.tools.get("set_session_name").execute("name", { name: "Stage update" }), /ticket title/i);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("title-less tickets protect their name while generation is pending", async () => {
  const cwd = await project();
  const delayed = delayedModel();
  try {
    await writeFile(join(cwd, "agent-work/features.yaml"), "- id: legacy-001\n  subtitle: Keep the task name stable\n");
    const runtime = harness(cwd, [], "Previous discussion", delayed.call);
    await runtime.commands.get("wf-ticket").handler("legacy-001", runtime.ctx);
    assert.equal(delayed.calls.length, 1);
    assert.equal(runtime.name, "legacy-001");
    runtime.externalName("Review stage");
    await runtime.emit("session_info_changed", { name: "Review stage" });
    assert.equal(runtime.name, "legacy-001");
    delayed.calls[0].resolve("Legacy Work");
    await settle();
    assert.equal(runtime.name, "Legacy Work");
    runtime.externalName("Another stage");
    await runtime.emit("session_info_changed", { name: "Another stage" });
    assert.equal(runtime.name, "Legacy Work");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("explicit session-name refresh awaits its model result and reports", async () => {
  const cwd = await project();
  try {
    const delayed = delayedModel();
    const branch = [{ type: "message", message: { role: "user", content: "Refresh this metadata session" } }];
    const runtime = harness(cwd, branch, "Old Name", delayed.call);
    const refresh = runtime.commands.get("session-name").handler("refresh", runtime.ctx);
    await settle();
    assert.equal(delayed.calls.length, 1);
    assert.equal(runtime.operations.some((item) => item.kind === "notify"), false);
    delayed.calls[0].resolve("Fresh Metadata");
    await refresh;
    assert.equal(runtime.name, "Fresh Metadata");
    assert.equal(runtime.operations.at(-1).message, "Session name refreshed.");

    const stale = delayedModel();
    const changed = harness(cwd, branch, "Old Name", stale.call);
    const rejected = changed.commands.get("session-name").handler("refresh", changed.ctx);
    await settle();
    assert.equal(stale.calls.length, 1);
    changed.externalName("External Name");
    stale.calls[0].resolve("Stale Generated Name");
    await rejected;
    assert.equal(changed.name, "External Name");
    assert.equal(changed.operations.at(-1).message, "Could not refresh the session name.");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("session metadata models are fixed to Luna then Spark", async () => {
  const active = { provider: "openai-codex", id: "gpt-5.6-sol" };
  const candidates = new Map([
    ["gpt-5.3-codex-spark", { provider: "openai-codex", id: "gpt-5.3-codex-spark" }],
    ["gpt-5.6-luna", { provider: "openai-codex", id: "gpt-5.6-luna" }],
  ]);
  const authenticated = [];
  const resolved = await resolveSessionModels({
    model: active,
    modelRegistry: {
      find(provider, id) { return provider === "openai-codex" ? candidates.get(id) : undefined; },
      async getApiKeyAndHeaders(model) {
        authenticated.push(model.id);
        return { ok: true, apiKey: "test-key" };
      },
    },
  });

  assert.deepEqual(resolved.map(({ model }) => model.id), ["gpt-5.6-luna", "gpt-5.3-codex-spark"]);
  assert.deepEqual(authenticated, ["gpt-5.6-luna", "gpt-5.3-codex-spark"]);
  assert.equal(authenticated.includes(active.id), false);
});

test("metadata calls use medium reasoning, five seconds, and skip unsupported models", async () => {
  const candidates = new Map([
    ["gpt-5.3-codex-spark", { provider: "openai-codex", id: "gpt-5.3-codex-spark" }],
    ["gpt-5.6-luna", { provider: "openai-codex", id: "gpt-5.6-luna" }],
  ]);
  const options = [];
  let clock = 0;
  const call = createSessionModelCall({
    now: () => clock,
    async complete(model, _context, requestOptions) {
      options.push({ model: model.id, ...requestOptions });
      clock += 100;
      if (model.id === "gpt-5.6-luna") {
        return { stopReason: "error", errorMessage: "not supported with a ChatGPT account", content: [] };
      }
      return { stopReason: "stop", content: [{ type: "text", text: "Metadata Runtime" }] };
    },
  });
  const ctx = {
    modelRegistry: {
      find(provider, id) { return provider === "openai-codex" ? candidates.get(id) : undefined; },
      async getApiKeyAndHeaders() { return { ok: true, apiKey: "test-key" }; },
    },
  };

  const first = await call(ctx, "prompt", "input", 64);
  assert.equal(first.outcome, "success");
  assert.equal(first.model, "gpt-5.3-codex-spark");
  assert.deepEqual(first.attempts.map((attempt) => [attempt.model, attempt.failure?.kind ?? attempt.outcome]), [
    ["gpt-5.6-luna", "unsupported"],
    ["gpt-5.3-codex-spark", "success"],
  ]);
  assert.ok(options.every((item) => item.reasoningEffort === "medium" && item.timeoutMs === 5_000));

  options.length = 0;
  const second = await call(ctx, "prompt", "input", 64);
  assert.equal(second.outcome, "success");
  assert.deepEqual(options.map((item) => item.model), ["gpt-5.3-codex-spark"]);
  assert.deepEqual(second.skippedModels, ["gpt-5.6-luna"]);

  call.reset();
  options.length = 0;
  const afterReset = await call(ctx, "prompt", "input", 64);
  assert.equal(afterReset.outcome, "success");
  assert.deepEqual(options.map((item) => item.model), ["gpt-5.6-luna", "gpt-5.3-codex-spark"]);
});

test("a reset isolates unsupported-model state from an older in-flight call", async () => {
  const candidates = new Map([
    ["gpt-5.3-codex-spark", { provider: "openai-codex", id: "gpt-5.3-codex-spark" }],
    ["gpt-5.6-luna", { provider: "openai-codex", id: "gpt-5.6-luna" }],
  ]);
  const attempted = [];
  let finishOldLuna;
  let holdLuna = true;
  const call = createSessionModelCall({
    async complete(model) {
      attempted.push(model.id);
      if (model.id === "gpt-5.6-luna" && holdLuna) {
        holdLuna = false;
        return new Promise((resolve) => { finishOldLuna = resolve; });
      }
      if (model.id === "gpt-5.6-luna") return { stopReason: "stop", content: [{ type: "text", text: "Fresh Luna" }] };
      return { stopReason: "stop", content: [{ type: "text", text: "Spark Fallback" }] };
    },
  });
  const ctx = {
    modelRegistry: {
      find(provider, id) { return provider === "openai-codex" ? candidates.get(id) : undefined; },
      async getApiKeyAndHeaders() { return { ok: true, apiKey: "test-key" }; },
    },
  };

  const oldCall = call(ctx, "prompt", "input", 64);
  await settle();
  call.reset();
  finishOldLuna({ stopReason: "error", errorMessage: "not supported with a ChatGPT account", content: [] });
  await oldCall;

  attempted.length = 0;
  const nextCall = await call(ctx, "prompt", "input", 64);
  assert.equal(nextCall.model, "gpt-5.6-luna");
  assert.deepEqual(attempted, ["gpt-5.6-luna"]);
});

test("metadata model resolution distinguishes missing authentication", async () => {
  const candidates = new Map([
    ["gpt-5.3-codex-spark", { provider: "openai-codex", id: "gpt-5.3-codex-spark" }],
    ["gpt-5.6-luna", { provider: "openai-codex", id: "gpt-5.6-luna" }],
  ]);
  const call = createSessionModelCall({ complete: async () => assert.fail("completion must not run") });
  const result = await call({
    modelRegistry: {
      find(provider, id) { return provider === "openai-codex" ? candidates.get(id) : undefined; },
      async getApiKeyAndHeaders() { return { ok: false }; },
    },
  }, "prompt", "input", 64);

  assert.equal(result.outcome, "failure");
  assert.equal(result.failure.kind, "authentication");
  assert.deepEqual(result.skippedModels, []);
});

test("session metadata commands disable calls and allow re-enabling", async () => {
  const cwd = await project();
  try {
    const delayed = delayedModel();
    const runtime = harness(cwd, [], undefined, delayed.call);
    await runtime.emit("session_start", { reason: "new" });

    await runtime.commands.get("session-metadata-disable").handler("", runtime.ctx);
    assert.match(runtime.renderWorkflow(80), /◇– meta/);
    await runtime.emit("input", { source: "interactive", text: "Do not name this session" });
    await runtime.emit("agent_end", { messages: [{ role: "assistant", stopReason: "stop", content: "Ready for review." }] });
    await settle();
    assert.equal(delayed.calls.length, 0);

    await runtime.commands.get("session-metadata-status").handler("", runtime.ctx);
    assert.match(runtime.operations.at(-1).message, /disabled/i);

    await runtime.commands.get("session-metadata-enable").handler("", runtime.ctx);
    assert.match(runtime.renderWorkflow(80), /◇ meta/);
    await runtime.emit("input", { source: "interactive", text: "Name this session now" });
    assert.equal(delayed.calls.length, 1);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("disabling session metadata invalidates an in-flight result", async () => {
  const cwd = await project();
  try {
    const delayed = delayedModel();
    const runtime = harness(cwd, [], undefined, delayed.call);
    await runtime.emit("input", { source: "interactive", text: "Start naming this session" });
    assert.equal(delayed.calls.length, 1);

    await runtime.commands.get("session-metadata-disable").handler("", runtime.ctx);
    await runtime.commands.get("session-metadata-enable").handler("", runtime.ctx);
    delayed.calls[0].resolve("Stale Name");
    await settle();

    assert.equal(runtime.name, undefined);
    assert.match(runtime.renderWorkflow(80), /◇ meta/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("metadata status badge and command report timeout without login advice", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [], undefined, async () => ({
      outcome: "failure",
      failure: { kind: "timeout", message: "Request timed out after 5000ms" },
      model: "gpt-5.6-luna",
      latencyMs: 5_000,
      attempts: [{ model: "gpt-5.6-luna", latencyMs: 5_000, outcome: "failure", failure: { kind: "timeout", message: "Request timed out after 5000ms" } }],
      skippedModels: ["gpt-5.3-codex-spark"],
    }));
    await runtime.emit("session_start", { reason: "new" });
    assert.equal(runtime.status("session-metadata"), undefined);
    assert.match(runtime.renderWorkflow(80), /◇ meta/);

    await runtime.emit("input", { source: "interactive", text: "Name this optional operation" });
    await settle();
    assert.match(runtime.renderWorkflow(80), /◇! meta/);

    const warning = runtime.operations.find((item) => item.kind === "notify" && item.level === "warning");
    assert.match(warning.message, /timed out/i);
    assert.doesNotMatch(warning.message, /\/login/);

    await runtime.commands.get("session-metadata-status").handler("", runtime.ctx);
    const report = runtime.operations.at(-1).message;
    assert.match(report, /gpt-5\.6-luna/);
    assert.match(report, /5000 ms/);
    assert.match(report, /timeout/i);
    assert.match(report, /gpt-5\.3-codex-spark/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("authentication failures use the auth badge and login advice", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [], undefined, async () => ({
      outcome: "failure",
      failure: { kind: "authentication", message: "OpenAI Codex authentication is unavailable" },
      latencyMs: 0,
      attempts: [],
      skippedModels: [],
    }));
    await runtime.emit("input", { source: "interactive", text: "Name this optional operation" });
    await settle();
    assert.match(runtime.renderWorkflow(80), /◇× meta/);
    const warning = runtime.operations.find((item) => item.kind === "notify" && item.level === "warning");
    assert.match(warning.message, /\/login openai-codex/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("invalidated metadata work restores the last settled badge state", async () => {
  const cwd = await project();
  try {
    const delayed = delayedModel();
    const runtime = harness(cwd, [], undefined, delayed.call);
    await runtime.emit("session_start", { reason: "new" });
    await runtime.emit("input", { source: "interactive", text: "Start naming this session" });
    assert.match(runtime.renderWorkflow(80), /◆ meta/);

    await runtime.emit("input", { source: "interactive", text: "This newer input invalidates naming" });
    assert.equal(delayed.calls.length, 1);
    delayed.calls[0].resolve("Stale Name");
    await settle();

    assert.match(runtime.renderWorkflow(80), /◇ meta/);
    await runtime.commands.get("session-metadata-status").handler("", runtime.ctx);
    assert.match(runtime.operations.at(-1).message, /No metadata request has run/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("invalidating newer work restores a valid older settled result", async () => {
  const cwd = await project();
  try {
    const delayed = delayedModel();
    const runtime = harness(cwd, [], undefined, delayed.call);
    await runtime.emit("session_start", { reason: "new" });
    await runtime.emit("input", { source: "interactive", text: "Name this optional operation" });
    await runtime.emit("agent_end", { messages: [{ role: "assistant", stopReason: "stop", content: "Ready for review." }] });
    await settle();
    assert.equal(delayed.calls.length, 2);

    delayed.calls[0].resolve("Settled Name");
    await settle();
    assert.match(runtime.renderWorkflow(80), /◆ meta/);

    await runtime.emit("input", { source: "interactive", text: "Invalidate the pending attention request" });
    delayed.calls[1].resolve('{"kind":"ready","text":"Stale attention","confidence":0.9}');
    await settle();

    assert.match(runtime.renderWorkflow(80), /◇ meta/);
    await runtime.commands.get("session-metadata-status").handler("", runtime.ctx);
    assert.match(runtime.operations.at(-1).message, /Parsed result: Settled Name/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("session shutdown prevents stale metadata from restoring the badge", async () => {
  const cwd = await project();
  try {
    const delayed = delayedModel();
    const runtime = harness(cwd, [], undefined, delayed.call);
    await runtime.emit("session_start", { reason: "new" });
    await runtime.emit("input", { source: "interactive", text: "Name this optional operation" });
    await runtime.emit("session_shutdown", { reason: "quit" });
    assert.equal(runtime.renderWorkflow(80), undefined);

    delayed.calls[0].resolve("Late Name");
    await settle();
    assert.equal(runtime.renderWorkflow(80), undefined);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("an older metadata request cannot overwrite the latest badge state", async () => {
  const cwd = await project();
  try {
    const delayed = delayedModel();
    const runtime = harness(cwd, [], undefined, delayed.call);
    await runtime.emit("session_start", { reason: "new" });
    await runtime.emit("input", { source: "interactive", text: "Name this optional operation" });
    assert.equal(delayed.calls.length, 1);
    assert.match(runtime.renderWorkflow(80), /◆ meta/);
    await runtime.emit("agent_end", { messages: [{ role: "assistant", stopReason: "stop", content: "Ready for review." }] });
    await settle();
    assert.equal(delayed.calls.length, 2);

    delayed.calls[1].resolve('{"kind":"ready","text":"Review the patch","confidence":0.9}');
    await settle();
    assert.match(runtime.renderWorkflow(80), /◇ meta/);

    delayed.calls[0].resolve({
      outcome: "failure",
      failure: { kind: "timeout", message: "Late timeout" },
      model: "gpt-5.6-luna",
      latencyMs: 5_000,
      attempts: [],
      skippedModels: [],
    });
    await settle();
    assert.match(runtime.renderWorkflow(80), /◇ meta/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("a valid null attention result is not a parse failure", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [], "Existing", async () => metadataSuccess("null"));
    await runtime.emit("input", { source: "interactive", text: "Explain the current state" });
    await runtime.emit("agent_end", { messages: [{ role: "assistant", stopReason: "stop", content: "The extension is active." }] });
    await settle();
    assert.match(runtime.renderWorkflow(80), /◇ meta/);
    await runtime.commands.get("session-metadata-status").handler("", runtime.ctx);
    assert.match(runtime.operations.at(-1).message, /success/i);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("metadata status records parse failures separately from model failures", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [], undefined, async () => metadataSuccess("This response has too many title words"));
    await runtime.emit("input", { source: "interactive", text: "Name this optional operation" });
    await settle();
    assert.match(runtime.renderWorkflow(80), /◇! meta/);
    await runtime.commands.get("session-metadata-status").handler("", runtime.ctx);
    const report = runtime.operations.at(-1).message;
    assert.match(report, /parse/i);
    assert.match(report, /Operation: session name/);
    assert.match(report, /Expected: 1–3 words, at most 32 characters, using letters and numbers only/);
    assert.match(report, /Received: This response has too many title words/);
    assert.match(report, /No user action is required/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("attention parse status shows its contract and bounds rejected output", async () => {
  const cwd = await project();
  try {
    const rejected = `not-json ${"x".repeat(600)}`;
    const runtime = harness(cwd, [], "Existing", async () => metadataSuccess(rejected));
    await runtime.emit("input", { source: "interactive", text: "Finish this operation" });
    await runtime.emit("agent_end", { messages: [{ role: "assistant", stopReason: "stop", content: "Ready for review." }] });
    await settle();

    await runtime.commands.get("session-metadata-status").handler("", runtime.ctx);
    const report = runtime.operations.at(-1).message;
    assert.match(report, /Operation: attention/);
    assert.match(report, /Expected: null or JSON with kind, text, and confidence/);
    assert.match(report, /Received: not-json/);
    assert.ok(report.length < 1_000);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("optional model operations quietly absorb resolver and injected call failures", async () => {
  const cwd = await project();
  const unhandled = [];
  const recordUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", recordUnhandled);
  try {
    const call = createSessionModelCall();
    const resolution = await call({
      model: undefined,
      modelRegistry: {
        find() { throw new Error("registry unavailable"); },
        async getApiKeyAndHeaders() { throw new Error("auth unavailable"); },
      },
    }, "prompt", "input", 64);
    assert.equal(resolution.outcome, "failure");
    assert.equal(resolution.failure.kind, "provider");

    const naming = delayedModel();
    const unnamed = harness(cwd, [], undefined, naming.call);
    await unnamed.emit("input", { source: "interactive", text: "Name this optional operation" });
    naming.calls[0].resolve(Promise.reject(new Error("naming failed")));
    await settle();
    assert.equal(unnamed.name, undefined);

    const attention = delayedModel();
    const completed = harness(cwd, [], "Existing", attention.call);
    await completed.emit("input", { source: "interactive", text: "Finish this operation" });
    await completed.emit("agent_end", { messages: [{ role: "assistant", stopReason: "stop", content: "Ready for review." }] });
    attention.calls[0].resolve(Promise.reject(new Error("attention failed")));
    await settle();
    assert.equal(completed.latest("pi-agent-hub-context"), undefined);

    const refresh = delayedModel();
    const explicit = harness(cwd, [{ type: "message", message: { role: "user", content: "Refresh this name" } }], "Old Name", refresh.call);
    const request = explicit.commands.get("session-name").handler("refresh", explicit.ctx);
    await settle();
    refresh.calls[0].resolve(Promise.reject(new Error("refresh failed")));
    await request;
    assert.equal(explicit.name, "Old Name");
    assert.equal(explicit.operations.at(-1).message, "Could not refresh the session name.");
    await settle();
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", recordUnhandled);
    await rm(cwd, { recursive: true, force: true });
  }
});

test("shortcut-started turns invalidate prior attention and get their own request", async () => {
  const cwd = await project();
  try {
    const delayed = delayedModel();
    const runtime = harness(cwd, [], "Metadata redesign", delayed.call);
    await runtime.emit("input", { source: "interactive", text: "/skill:review meta-001" });
    await runtime.emit("agent_end", { messages: [{ role: "assistant", stopReason: "stop", content: "Review complete." }] });
    assert.equal(delayed.calls.length, 1);

    const advance = runtime.shortcuts.get("ctrl+shift+right");
    await advance.handler(runtime.ctx);
    await advance.handler(runtime.ctx);
    delayed.calls[0].resolve('{"kind":"ready","text":"Review stale work","confidence":0.9}');
    await settle();
    assert.equal(runtime.latest("pi-agent-hub-context").attention, undefined);

    await runtime.emit("agent_end", { messages: [{ role: "assistant", stopReason: "stop", content: "Reflection complete." }] });
    assert.equal(delayed.calls.length, 2);
    assert.match(delayed.calls[1].input, /\/skill:reflect meta-001/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("agent-end plan reads cannot pair an old response with newer input", async () => {
  const cwd = await project();
  try {
    const delayed = delayedModel();
    const runtime = harness(cwd, [], "Metadata redesign", delayed.call);
    await runtime.emit("input", { source: "interactive", text: "/skill:review meta-001" });
    const ending = runtime.emit("agent_end", { messages: [{ role: "assistant", stopReason: "stop", content: "Old turn complete." }] });
    await runtime.emit("input", { source: "interactive", text: "Start newer work" });
    await ending;
    assert.equal(delayed.calls.length, 0);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("final-turn attention is detached and stale after new input", async () => {
  const cwd = await project();
  try {
    const delayed = delayedModel();
    const runtime = harness(cwd, [], "Existing", delayed.call);
    await runtime.emit("input", { source: "interactive", text: "Finish the review" });
    await runtime.emit("agent_end", { messages: [{ role: "assistant", stopReason: "stop", content: "Ready for review." }] });
    assert.equal(delayed.calls.length, 1);
    assert.equal(runtime.latest("pi-agent-hub-context"), undefined);
    delayed.calls[0].resolve('{"kind":"ready","text":"Review the patch","confidence":0.9}');
    await settle();
    assert.deepEqual(runtime.latest("pi-agent-hub-context").attention, { kind: "ready", text: "Review the patch" });

    const stale = delayedModel();
    const changed = harness(cwd, [], "Existing", stale.call);
    await changed.emit("input", { source: "interactive", text: "Finish the review" });
    await changed.emit("agent_end", { messages: [{ role: "assistant", stopReason: "stop", content: "Ready for review." }] });
    await changed.emit("input", { source: "interactive", text: "One more change" });
    stale.calls[0].resolve('{"kind":"ready","text":"Review stale work","confidence":0.9}');
    await settle();
    assert.equal(changed.latest("pi-agent-hub-context"), undefined);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("structured question starts publish bounded attention and matching completion clears it", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [], "Existing");
    const first = {
      toolCallId: "provider-call-one",
      toolName: "ask_user_question",
      args: { questions: [{ question: "Which rollout should we use?", options: [{ label: "Do not publish this" }] }] },
    };
    await runtime.emit("tool_execution_start", first);
    const firstAttention = runtime.latest("pi-agent-hub-context").attention;
    assert.equal(firstAttention.kind, "question");
    assert.equal(firstAttention.text, "Which rollout should we use?");
    assert.equal(firstAttention.requestId.length, 64);
    assert.equal(JSON.stringify(firstAttention).includes("Do not publish this"), false);

    const contexts = runtime.branch.filter((entry) => entry.customType === "pi-agent-hub-context").length;
    await runtime.emit("tool_execution_start", { toolCallId: "invalid", toolName: "ask_user_question", args: { questions: [] } });
    await runtime.emit("tool_execution_start", { toolCallId: "missing", toolName: "ask_user_question" });
    assert.equal(runtime.branch.filter((entry) => entry.customType === "pi-agent-hub-context").length, contexts);

    await runtime.emit("tool_execution_start", {
      toolCallId: "provider-call-two",
      toolName: "ask_user_question",
      args: { questions: [{ question: "Choose a replacement?" }, { question: "And timing?" }] },
    });
    const secondAttention = runtime.latest("pi-agent-hub-context").attention;
    assert.equal(secondAttention.text, "Choose a replacement? (+1 more)");
    assert.notEqual(secondAttention.requestId, firstAttention.requestId);

    await runtime.emit("tool_execution_end", { toolCallId: first.toolCallId, toolName: "ask_user_question", isError: false });
    assert.deepEqual(runtime.latest("pi-agent-hub-context").attention, secondAttention);
    await runtime.emit("tool_execution_end", { toolCallId: "provider-call-two", toolName: "ask_user_question", isError: true });
    assert.equal(runtime.latest("pi-agent-hub-context").attention, undefined);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("Plan question starts retain clarification activity and question attention", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [], "Metadata redesign");
    await runtime.emit("input", { source: "interactive", text: "/skill:plan-md meta-001" });
    await runtime.emit("tool_execution_start", {
      toolCallId: "plan-question",
      toolName: "ask_user_question",
      args: { questions: [{ question: "Confirm the scope?" }] },
    });
    assert.equal(runtime.latest("workflow-runtime").activity.id, "clarifying-requirements");
    assert.deepEqual(runtime.latest("pi-agent-hub-context").attention.kind, "question");
    await runtime.emit("tool_execution_end", { toolCallId: "plan-question", toolName: "ask_user_question", isError: false });
    assert.equal(runtime.latest("pi-agent-hub-context").attention, undefined);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("session start clears only restored request-backed question attention", async () => {
  const cwd = await project();
  try {
    const cases = [
      [{ requestId: "r".repeat(64), kind: "question", text: "Stale questionnaire" }, undefined],
      [{ kind: "question", text: "Historical question" }, { kind: "question", text: "Historical question" }],
      [{ requestId: "b".repeat(64), kind: "blocked", text: "Still blocked" }, { requestId: "b".repeat(64), kind: "blocked", text: "Still blocked" }],
      [{ kind: "ready", text: "Review this" }, { kind: "ready", text: "Review this" }],
    ];
    for (const [attention, expected] of cases) {
      const runtime = harness(cwd, [{
        type: "custom",
        customType: "pi-agent-hub-context",
        data: { version: 1, updatedAt: 10, attention },
      }], "Existing");
      await runtime.emit("session_start", { reason: "resume" });
      assert.deepEqual(runtime.latest("pi-agent-hub-context").attention, expected);
    }
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("tool starts automate only exact plan questions and critic launches", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [], "Metadata redesign");
    await runtime.emit("input", { source: "interactive", text: "/skill:plan-md meta-001" });
    await runtime.tools.get("set_workflow_activity").execute("write", { activityId: "writing-plan" }, undefined, undefined, runtime.ctx);
    await runtime.emit("tool_execution_start", { toolName: "ask_user_question", args: {} });
    assert.equal(runtime.latest("workflow-runtime").activity.id, "clarifying-requirements");
    await runtime.emit("tool_execution_start", { toolName: "ask_user_question", args: {} });
    assert.equal(runtime.latest("workflow-runtime").activity.pass, undefined);

    await runtime.emit("tool_execution_start", { toolName: "tmux_subagent", args: { agent: "plan-critic" } });
    assert.equal(runtime.latest("workflow-runtime").activity.id, "reviewing-plan");
    await runtime.tools.get("set_workflow_activity").execute("update", { activityId: "updating-plan" }, undefined, undefined, runtime.ctx);
    await runtime.emit("tool_execution_start", { toolName: "tmux_subagent", args: { agent: "plan-critic" } });
    assert.equal(runtime.latest("workflow-runtime").activity.pass, 2);

    for (const action of ["list", "get", "status", "wait", "send", "cancel", "stop"]) {
      await runtime.emit("tool_execution_start", { toolName: "tmux_subagent", args: { action, agent: "plan-critic" } });
      assert.equal(runtime.latest("workflow-runtime").activity.pass, 2, action);
    }
    await runtime.emit("tool_execution_start", { toolName: "tmux_subagent", args: { agent: "code-critic" } });
    assert.equal(runtime.latest("workflow-runtime").activity.pass, 2);
    await runtime.emit("tool_execution_start", { toolName: "bash", args: { agent: "plan-critic" } });
    assert.equal(runtime.latest("workflow-runtime").activity.pass, 2);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("managed primary cwd owns ticket context and plan reads", async () => {
  const source = await mkdtemp(join(tmpdir(), "rules-source-"));
  const managed = await project();
  const previous = process.env.PI_AGENT_HUB_PRIMARY_CWD;
  try {
    process.env.PI_AGENT_HUB_PRIMARY_CWD = managed;
    const runtime = harness(source);
    await runtime.emit("input", { source: "interactive", text: "/skill:execute meta-001" });
    assert.equal(runtime.name, "Metadata redesign");
    assert.deepEqual(runtime.latest("pi-agent-hub-context").ticket, {
      id: "meta-001",
      subtitle: "Simplify cross package session context",
      description: "User can rely on one context.",
    });
    assert.deepEqual(runtime.latest("workflow-runtime").plan.tasks, { completed: 0, total: 1 });
    assert.equal("cwd" in runtime.latest("workflow-runtime"), false);
    assert.equal("cwd" in runtime.latest("pi-agent-hub-context"), false);
  } finally {
    if (previous === undefined) delete process.env.PI_AGENT_HUB_PRIMARY_CWD; else process.env.PI_AGENT_HUB_PRIMARY_CWD = previous;
    await rm(source, { recursive: true, force: true });
    await rm(managed, { recursive: true, force: true });
  }
});

test("queued workflow skills become active only when their user message is delivered", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [], "Metadata redesign");
    await runtime.emit("input", { source: "interactive", text: "/skill:execute meta-001" });
    assert.equal(runtime.latest("workflow-runtime").activeStep, "execute");

    await runtime.emit("input", {
      source: "interactive",
      text: "/skill:review meta-001",
      streamingBehavior: "followUp",
    });
    assert.equal(runtime.latest("workflow-runtime").activeStep, "execute");
    assert.match(runtime.renderWorkflow(80), /◉ Execute ─ · Review/);

    await runtime.emit("message_start", {
      message: {
        role: "user",
        content: [{ type: "text", text: '<skill name="review" location="/skills/review/SKILL.md">\nReview instructions can mention </skill> syntax.\n</skill>\n\nmeta-001' }],
      },
    });
    assert.equal(runtime.latest("workflow-runtime").activeStep, "review");
    assert.match(runtime.renderWorkflow(80), /✓ Execute ─ ◉ Review/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("queued focus does not affect Execute until delivery", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [], "Metadata redesign");
    await runtime.emit("input", { source: "interactive", text: "/skill:execute meta-001" });
    await runtime.emit("input", {
      source: "interactive",
      text: "/skill:focus meta-001",
      streamingBehavior: "followUp",
    });
    assert.equal(runtime.latest("workflow-runtime").execution, undefined);
    assert.match(runtime.renderWorkflow(80), /◉ Execute ─ · Review/);

    await runtime.emit("message_start", {
      message: {
        role: "user",
        content: [{ type: "text", text: '<skill name="focus" location="/skills/focus/SKILL.md">\nFocus instructions\n</skill>\n\nmeta-001' }],
      },
    });
    assert.equal(runtime.latest("workflow-runtime").execution.mode, "focus");
    assert.match(runtime.renderWorkflow(80), /[◇◆] Focus ─ · Review/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("raw queued workflow skill messages also activate on delivery", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [], "Metadata redesign");
    await runtime.emit("input", { source: "interactive", text: "/skill:execute meta-001" });
    await runtime.emit("input", {
      source: "interactive",
      text: "/skill:review meta-001",
      streamingBehavior: "steer",
    });
    assert.equal(runtime.latest("workflow-runtime").activeStep, "execute");

    await runtime.emit("message_start", {
      message: { role: "user", content: "/skill:review meta-001" },
    });
    assert.equal(runtime.latest("workflow-runtime").activeStep, "review");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("undelivered queued workflow skills do not change later turns", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [], "Metadata redesign");
    await runtime.emit("input", { source: "interactive", text: "/skill:execute meta-001" });
    await runtime.emit("input", {
      source: "interactive",
      text: "/skill:review meta-001",
      streamingBehavior: "followUp",
    });
    await runtime.emit("agent_settled");

    await runtime.emit("message_start", {
      message: {
        role: "user",
        content: [{ type: "text", text: '<skill name="review" location="/skills/review/SKILL.md">\nReview instructions\n</skill>\n\nmeta-001' }],
      },
    });
    assert.equal(runtime.latest("workflow-runtime").activeStep, "execute");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("workflow widget uses positional full and bounded narrow markers", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [], "Metadata redesign");
    await runtime.emit("input", { source: "interactive", text: "/skill:review" });
    assert.match(runtime.renderWorkflow(80), /^✓ Plan ─ ✓ Execute ─ ◉ Review ─ · Reflect ─ · Commit · ◇ meta$/);
    assert.equal(runtime.renderWorkflow(8), "3/5 ◉ RV");
    await runtime.emit("input", { source: "interactive", text: "/skill:execute" });
    assert.match(runtime.renderWorkflow(80), /^✓ Plan ─ ◉ Execute ─ · Review ─ · Reflect ─ · Commit · ◇ meta$/);
    await runtime.emit("input", { source: "interactive", text: "/skill:review" });
    await runtime.tools.get("set_workflow_activity").execute("done", { activityId: "review-complete" }, undefined, undefined, runtime.ctx);
    assert.match(runtime.renderWorkflow(80), /^✓ Plan ─ ✓ Execute ─ ✓ Review ─ · Reflect ─ · Commit · ◇ meta$/);
    assert.equal(runtime.renderWorkflow(8), "3/5 ✓ RV");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("complete workflow retains all-check terminal state until replacement or clear", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [], "Metadata redesign");
    await runtime.emit("input", { source: "interactive", text: "/skill:commit meta-001" });
    const result = await runtime.tools.get("complete_workflow").execute("done", {}, undefined, undefined, runtime.ctx);
    assert.equal(runtime.latest("workflow-runtime").currentStepComplete, true);
    assert.equal(runtime.latest("workflow-runtime").activity.label, "Commit complete");
    assert.match(result.content[0].text, /retained/);
    const advance = runtime.shortcuts.get("ctrl+shift+right");
    await advance.handler(runtime.ctx);
    await advance.handler(runtime.ctx);
    assert.equal(runtime.latest("workflow-runtime").activeStep, undefined);
    assert.equal(runtime.latest("pi-agent-hub-context").ticket.id, "meta-001");
    await assert.rejects(runtime.tools.get("set_session_name").execute("name", { name: "Still linked" }), /ticket title/i);
    await runtime.commands.get("wf-clear").handler("", runtime.ctx);
    assert.equal(runtime.latest("pi-agent-hub-context").ticket, undefined);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("activity passes persist on resume and reset on same-skill reinvocation", async () => {
  const cwd = await project();
  try {
    const runtime = harness(cwd, [], "Metadata redesign");
    await runtime.emit("input", { source: "interactive", text: "/skill:plan-md meta-001" });
    const activity = runtime.tools.get("set_workflow_activity");
    await activity.execute("1", { activityId: "reviewing-plan" }, undefined, undefined, runtime.ctx);
    const result = await activity.execute("2", { activityId: "reviewing-plan" }, undefined, undefined, runtime.ctx);
    assert.equal(runtime.latest("workflow-runtime").activity.pass, 2);
    assert.equal(result.content[0].text, "Workflow activity: Reviewing plan (pass 2).");

    const resumed = harness(cwd, runtime.branch, "Metadata redesign");
    await resumed.emit("session_start", { reason: "resume" });
    assert.equal(resumed.latest("workflow-runtime").activity.pass, 2);
    await resumed.emit("input", { source: "interactive", text: "/skill:plan-md meta-001" });
    await resumed.tools.get("set_workflow_activity").execute("4", { activityId: "reviewing-plan" }, undefined, undefined, resumed.ctx);
    assert.equal(resumed.latest("workflow-runtime").activity.pass, undefined);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});
