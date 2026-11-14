import assert from "node:assert/strict";
import test from "node:test";
import { replay } from "../tools/card-signal/replay.ts";
import { metrics } from "../tools/card-signal/metrics.ts";
import { aggregateMetrics } from "../tools/card-signal/cli.ts";

function cadenceFixture() {
  const rows = []; let parentId = null; const origin = Date.parse("2026-01-01T00:00:00Z");
  const add = (s, data) => { const row = { id: String(rows.length), parentId, timestamp: new Date(origin + s * 1000).toISOString(), ...data }; rows.push(row); parentId = row.id; };
  const state = (s, completed, total = 4) => add(s, { type: "custom", customType: "workflow-runtime", data: { activeStep: "execute", ticketId: "fixture-001", plan: { tasks: { completed, total }, ...(total === 4 ? { phases: [{ completed: Math.min(completed, 2), total: 2 }, { completed: Math.max(0, completed - 2), total: 2 }] } : {}), nextStep: "Task" } } });
  const call = (s, end, name, path, error = false) => {
    const id = `call-${rows.length}`;
    add(s, { type: "message", message: { role: "assistant", content: [{ type: "toolCall", id, name, arguments: name === "bash" && path ? { command: "cd agent-work/plans && python3 update_plan.py fixture-001.md && false" } : { path } }], stopReason: "toolUse" } });
    add(end, { type: "message", message: { role: "toolResult", toolCallId: id, toolName: name, content: [], isError: error } });
  };
  add(0, { type: "message", message: { role: "user", content: "Implement four tasks" } });
  state(0, 0); state(1, 0); // A duplicate publication is not a checkbox update.
  call(10, 12, "edit", "sum.js");
  call(19, 20, "edit", "agent-work/plans/fixture-001.md"); state(20, 1);
  call(80, 82, "write", "sum.test.js");
  call(91, 92, "bash", "agent-work/plans/fixture-001.md", true); state(92, 3); // The write succeeded before a later command failed.
  call(94, 95, "edit", "agent-work/plans/fixture-001.md"); state(95, 4);
  call(96, 97, "edit", "agent-work/plans/fixture-001.md", true); state(97, 4); // Failure still costs a tool call.
  call(98, 99, "bash", "");
  add(100, { type: "message", message: { role: "assistant", content: "Finished", stopReason: "stop" } });
  add(150, { type: "custom", customType: "workflow-runtime", data: { activeStep: "review" } });
  state(200, 1, 3);
  call(205, 206, "edit", "other.js");
  add(210, { type: "message", message: { role: "assistant", content: "Paused", stopReason: "stop" } });
  return replay(rows);
}

test("Execute cadence distinguishes task and burst ticks, measures late ticks, lag and call overhead", () => {
  const [first, second] = metrics(cadenceFixture()).execute_cadence;
  assert.equal(first.checkbox_updates, 3);
  assert.deepEqual(first.tasks_ticked_per_update.values, [1, 2, 1]);
  assert.deepEqual(first.update_interval_s.values, [72, 3]);
  assert.equal(first.update_interval_s.median, 3);
  assert.equal(first.update_interval_s.max, 72);
  assert.equal(first.tasks_ticked, 4);
  assert.deepEqual(first.updates.map(u => u.phases_completed), [0, 1, 1]);
  assert.deepEqual(first.updates.map(u => u.whole_phases_ticked), [0, 0, 0]);
  assert.equal(first.ticks_in_final_tenth_share, .75);
  assert.equal(first.all_plan_tasks_checked_at_end, true);
  assert.equal(first.finished_tasks_all_ticked, true);
  assert.equal(first.plan_edit_calls, 4);
  assert.equal(first.tool_calls, 7);
  assert.equal(first.plan_edit_tool_call_share, 4/7);
  assert.deepEqual(first.last_code_change_to_tick_s.values, [8, 10]);
  assert.equal(first.closed, true);
  assert.equal(first.duration_s, 100); // Ignore trailing idle time before Review.
  assert.equal(second.checkbox_updates, 0);
  assert.equal(second.update_interval_s.max, null);
  assert.equal(second.ticks_in_final_tenth_share, null);
  assert.equal(second.all_plan_tasks_checked_at_end, false);
  assert.equal(second.finished_tasks_all_ticked, null); // Logs cannot prove whether an unchecked task finished.
  assert.equal(second.closed, false);
});

test("switching the ticket closes an Execute episode even when the step stays Execute", () => {
  const rows = [
    { activeStep: "execute", ticketId: "fixture-001", plan: { tasks: { completed: 0, total: 2 } } },
    { activeStep: "execute", ticketId: "fixture-001", plan: { tasks: { completed: 1, total: 2 } } },
    { activeStep: "execute", ticketId: "fixture-002", plan: { tasks: { completed: 0, total: 3 } } },
    { activeStep: "review" },
  ].map((data,i) => ({ type: "custom", customType: "workflow-runtime", id: String(i), parentId: i ? String(i-1) : null, timestamp: new Date(1700000000000 + i * 10000).toISOString(), data }));
  const cadence = metrics(replay(rows)).execute_cadence;
  assert.equal(cadence.length, 2);
  assert.equal(cadence[0].checkbox_updates, 1);
  assert.equal(cadence[1].checkbox_updates, 0);
  assert.ok(cadence.every(c => c.closed));
});

test("cadence aggregates keep zero-update runs and do not average overhead percentages", () => {
  const summary = aggregateMetrics([metrics(cadenceFixture())]).execute_cadence;
  assert.equal(summary.runs, 2);
  assert.equal(summary.zero_update_runs, 1);
  assert.equal(summary.checkbox_updates, 3);
  assert.equal(summary.burst_updates, 1);
  assert.equal(summary.single_task_updates, 2);
  assert.equal(summary.phase_checkpoint_updates, 2);
  assert.equal(summary.whole_phase_burst_updates, 0);
  assert.equal(summary.plan_edit_tool_call_share, 4/8);
  assert.deepEqual(summary.end_plan_completeness, { complete: 1, incomplete: 1, unknown: 0 });
  assert.deepEqual(summary.finished_tasks_all_ticked, { confirmed: 1, unknown: 1 });
});
