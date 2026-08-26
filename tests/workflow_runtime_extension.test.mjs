import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import workflowRuntime from "../extensions/workflow-runtime/index.ts";
import { PlanWidget } from "../extensions/workflow-runtime/plan-widget.ts";
import { boundedModelCall } from "../extensions/workflow-runtime/session-model.ts";
import { TodoPanel } from "../extensions/workflow-runtime/todo-panel.ts";

function harness(cwd, initialBranch = [], initialName, modelCall) {
  const handlers = new Map();
  const commands = new Map();
  const shortcuts = new Map();
  const tools = new Map();
  const branch = structuredClone(initialBranch);
  const operations = [];
  const widgets = new Map();
  let name = initialName;
  const ui = {
    theme: { fg: (_token, text) => text, bg: (_token, text) => text, bold: (text) => text },
    setWidget(id, factory) { if (factory) widgets.set(id, factory); else widgets.delete(id); },
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
    sendMessage() {},
    sendUserMessage() {},
    events: { on() {}, emit() {} },
  };
  workflowRuntime(pi, modelCall ? { modelCall } : undefined);
  return {
    branch,
    commands,
    shortcuts,
    tools,
    operations,
    ctx,
    get name() { return name; },
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

function delayedModel() {
  const calls = [];
  return {
    calls,
    call(_ctx, prompt, input) {
      return new Promise((resolve) => calls.push({ prompt, input, resolve }));
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
    assert.deepEqual([...runtime.commands.keys()].sort(), ["session-name", "wf-clear", "wf-ticket", "wf-todos"]);
    assert.ok(runtime.shortcuts.has("ctrl+shift+right"));
    assert.equal(runtime.shortcuts.size, 2);
    for (const tool of ["set_session_name", "set_workflow_activity", "set_workflow_ticket", "complete_workflow"]) assert.ok(runtime.tools.has(tool));
  } finally { await rm(cwd, { recursive: true, force: true }); }
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
    const changed = harness(cwd, [], "Old Name", stale.call);
    await changed.commands.get("wf-ticket").handler("missing-001", changed.ctx);
    await settle();
    stale.calls[0].resolve("Missing Ticket");
    await settle();
    const rejected = changed.commands.get("session-name").handler("refresh", changed.ctx);
    for (let attempt = 0; attempt < 10 && stale.calls.length < 2; attempt++) await settle();
    assert.equal(stale.calls.length, 2);
    changed.externalName("External Name");
    stale.calls[1].resolve("Stale Generated Name");
    await rejected;
    assert.equal(changed.name, "External Name");
    assert.equal(changed.operations.at(-1).message, "Could not refresh the session name.");
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test("optional model operations quietly absorb resolver and injected call failures", async () => {
  const cwd = await project();
  const unhandled = [];
  const recordUnhandled = (reason) => unhandled.push(reason);
  process.on("unhandledRejection", recordUnhandled);
  try {
    const resolution = await boundedModelCall({
      model: undefined,
      modelRegistry: {
        find() { throw new Error("registry unavailable"); },
        async getApiKeyAndHeaders() { throw new Error("auth unavailable"); },
      },
    }, "prompt", "input", 64);
    assert.equal(resolution, undefined);

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
    assert.match(runtime.renderWorkflow(80), /^✓ Plan ─ ✓ Execute ─ ◉ Review ─ · Reflect ─ · Commit$/);
    assert.equal(runtime.renderWorkflow(8), "3/5 ◉ RV");
    await runtime.emit("input", { source: "interactive", text: "/skill:execute" });
    assert.match(runtime.renderWorkflow(80), /^✓ Plan ─ ◉ Execute ─ · Review ─ · Reflect ─ · Commit$/);
    await runtime.emit("input", { source: "interactive", text: "/skill:review" });
    await runtime.tools.get("set_workflow_activity").execute("done", { activityId: "review-complete" }, undefined, undefined, runtime.ctx);
    assert.match(runtime.renderWorkflow(80), /^✓ Plan ─ ✓ Execute ─ ✓ Review ─ · Reflect ─ · Commit$/);
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
    await runtime.commands.get("wf-clear").handler("", runtime.ctx);
    assert.equal(runtime.latest("workflow-runtime").activeStep, undefined);
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
