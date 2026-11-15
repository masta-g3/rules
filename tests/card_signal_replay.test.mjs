import assert from "node:assert/strict";
import test from "node:test";
import { replay, shownAt, activeBranch, lastAssistantText } from "../tools/card-signal/replay.ts";
import { metrics } from "../tools/card-signal/metrics.ts";

const base = Date.parse("2026-01-01T00:00:00Z");
function fixture() {
  const rows = []; let parentId = null;
  const add = (s, value) => { const row = { id: String(rows.length), parentId, timestamp: new Date(base + s * 1000).toISOString(), ...value }; rows.push(row); parentId = row.id; return row; };
  const msg = (s, role, content, rest = {}) => add(s, { type: "message", message: { role, content, ...rest } });
  const context = (s, data) => add(s, { type: "custom", customType: "pi-agent-hub-context", data: { version: 1, updatedAt: base + s * 1000, ...data } });
  msg(0, "user", "Fix sum");
  msg(1, "assistant", [{ type: "text", text: "I will read sum.js" }, { type: "toolCall", id: "a", name: "read", arguments: { path: "sum.js" } }], { stopReason: "toolUse" });
  msg(3, "toolResult", [], { toolCallId: "a", toolName: "read" });
  msg(4, "assistant", [{ type: "text", text: "Found the bug" }], { stopReason: "stop" });
  context(6, { progress: { done: "Found the bug", next: "Fix sum", updatedAt: base + 6000 } });
  msg(10, "user", "Now fix it");
  add(11, { type: "custom", customType: "workflow-runtime", data: { activeStep: "execute", lens: { doing: "Fix sum" } } });
  msg(12, "assistant", [{ type: "text", text: "I will fix sum" }, { type: "toolCall", id: "b", name: "edit", arguments: { path: "sum.js", oldText: "a-b", newText: "a+b" } }], { stopReason: "toolUse" });
  msg(14, "toolResult", [], { toolCallId: "b", toolName: "edit" });
  msg(15, "assistant", [{ type: "toolCall", id: "c", name: "bash", arguments: { command: "node --test" } }], { stopReason: "toolUse" });
  msg(17, "toolResult", [], { toolCallId: "c", toolName: "bash" });
  msg(18, "assistant", [{ type: "text", text: "Fixed sum" }], { stopReason: "stop" });
  context(19, { attention: { kind: "ready", text: "Fixed sum" }, progress: { done: "Found the bug", next: "Fix sum", updatedAt: base + 6000 } });
  msg(20, "user", "Explain subtraction");
  add(21, { type: "custom", customType: "workflow-runtime", data: {} });
  msg(22, "assistant", [{ type: "text", text: "Subtract b from a" }], { stopReason: "stop" });
  // A dead branch must not leak into replay.
  rows.push({ id: "dead", parentId: "0", timestamp: new Date(base + 23000).toISOString(), type: "message", message: { role: "user", content: "DEAD" } });
  rows.push({ id: "leaf", parentId, timestamp: new Date(base + 24000).toISOString(), type: "label" });
  return rows;
}

test("follows the last leaf and clears live SAID on a new user message", () => {
  const rows = fixture(); const branch = activeBranch(rows);
  assert.equal(branch.some(e => e.id === "dead"), false);
  assert.equal(lastAssistantText(branch.filter(e => Date.parse(e.timestamp) <= base + 10000)), undefined);
  const run = replay(rows);
  assert.equal(shownAt(run, base + 2000).shown.now, "read sum.js");
  assert.equal(shownAt(run, base + 4000).shown.now, undefined);
  assert.equal(shownAt(run, base + 4000).shown.said, "Found the bug");
  assert.equal(shownAt(run, base + 10000).shown.said, undefined);
  assert.equal(shownAt(run, base + 12000).shown.next, undefined);
  assert.equal(shownAt(run, base + 12000).shown.doing, "Fix sum");
  assert.equal(shownAt(run, base + 16000).shown.roster.field, "DOING");
  assert.equal(shownAt(run, base + 20000).shown.said, undefined);
});

test("SAID fallback is idle-only and suppressed by an unread request", () => {
  const rows = fixture();
  rows.splice(-2, 2); // keep linear branch
  rows.push({ id: "end", parentId: rows.at(-1).id, type: "message", timestamp: new Date(base + 25000).toISOString(), message: { role: "user", content: "New task" } });
  rows.push({ id: "end2", parentId: "end", type: "message", timestamp: new Date(base + 26000).toISOString(), message: { role: "assistant", content: [], stopReason: "stop" } });
  const run = replay(rows);
  assert.equal(shownAt(run, base + 26000).shown.said, "Fixed sum");
  assert.equal(shownAt(run, base + 26000).saidSource, "fallback");
  rows[rows.findIndex(e => e.customType === "pi-agent-hub-context" && e.data.attention)].data.attention.requestId = "unread";
  assert.equal(shownAt(replay(rows), base + 26000).shown.said, undefined);
  assert.equal(shownAt(replay(rows), base + 26000).shown.next, undefined);
});

test("timing metrics count unique notes, skipped turns, age and narration lag", () => {
  const rows = fixture();
  assert.equal(metrics(replay(rows)).note_age_at_action_s.n, 0); // The lens hides both notes.
  rows.find(e => e.customType === "workflow-runtime").data = {};
  const m = metrics(replay(rows));
  assert.deepEqual(m.note_lag_s.values, [2]);
  assert.equal(m.turns_without_note, 2);
  assert.equal(m.tool_calls, 3);
  assert.equal(m.note_age_at_action_s.n, 2);
  assert.equal(m.note_age_at_action_s.median, 6);
  assert.equal(m.note_older_than_turn_share, 1);
  assert.equal(m.said_narration_before_previous_tool_end, 1);
  assert.equal(m.unknown_tool_intervals, 0);
});

test("RPC tool intervals override serialized message times; unbounded tools are unknown", () => {
  const rows = fixture();
  const run = replay(rows, [
    { at: base + 1500, type: "tool_execution_start", toolCallId: "a", toolName: "read", args: { path: "sum.js" } },
    { at: base + 2500, type: "tool_execution_end", toolCallId: "a" },
  ]);
  assert.equal(run.calls[0].start, base + 1500);
  assert.equal(run.calls[0].end, base + 2500);
  const missing = rows.filter(e => e.message?.toolCallId !== "c");
  // Preserve a valid chain after removing the result.
  missing.find(e => e.id === "11").parentId = "9";
  const unknown = replay(missing);
  assert.equal(metrics(unknown).unknown_tool_intervals, 1);
  assert.equal(shownAt(unknown, base + 16000).known, false);
  assert.equal(shownAt(unknown, base + 16000).shown.now, "bash node --test");
  assert.equal(shownAt(unknown, base + 18000).shown.now, undefined);
});

test("request persists beyond the handoff tool and hides NEXT, but ready also hides DONE", () => {
  const rows = fixture().filter(e => e.id !== "dead");
  const handoff = rows.find(e => e.data?.attention);
  handoff.data.attention.requestId = "request";
  const run = replay(rows);
  const ready = shownAt(run, base + 19000);
  assert.equal(ready.shown.request, "Fixed sum");
  assert.equal(ready.shown.roster.field, "RDY");
  assert.equal(ready.shown.done, undefined);
  assert.equal(ready.shown.next, undefined);
  assert.equal(shownAt(run, base + 20000).shown.request, undefined);
});

test("checkbox lag requires a successful edit and an advancing Execute lens", () => {
  const rows = fixture().filter(e => e.id !== "dead");
  const parentId = rows.at(-1).id;
  rows.push({ id: "wf", parentId, timestamp: new Date(base + 25000).toISOString(), type: "custom", customType: "workflow-runtime", data: { activeStep: "execute", lens: { doing: "Fix sum" } } });
  rows.push({ id: "tick", parentId: "wf", timestamp: new Date(base + 26000).toISOString(), type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "tick-call", name: "edit", arguments: { path: "agent-work/plans/task.md", oldText: "- [ ] Fix", newText: "- [x] Fix" } }] } });
  rows.push({ id: "ticked", parentId: "tick", timestamp: new Date(base + 27000).toISOString(), type: "message", message: { role: "toolResult", toolCallId: "tick-call", isError: false } });
  assert.equal(metrics(replay(rows)).doing_task_lag_s.n, 0);
  rows.push({ id: "advanced", parentId: "ticked", timestamp: new Date(base + 27000).toISOString(), type: "custom", customType: "workflow-runtime", data: { activeStep: "execute", lens: { doing: "Verify sum" } } });
  assert.deepEqual(metrics(replay(rows)).doing_task_lag_s.values, [13]);
});

test("pending text and thinking never become SAID", () => {
  assert.equal(lastAssistantText([{ type: "message", message: { role: "assistant", stopReason: "pending", content: [{ type: "text", text: "partial" }] } }]), undefined);
  assert.equal(lastAssistantText([{ type: "message", message: { role: "assistant", content: [{ type: "thinking", thinking: "secret" }] } }]), undefined);
});
