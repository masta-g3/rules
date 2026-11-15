import assert from "node:assert/strict";
import test from "node:test";
import { classifyTool, OpenSessionTrack } from "../extensions/workflow-runtime/open-session.ts";
import { withWorkflowDefinition } from "../extensions/workflow-runtime/core.ts";
import { parseProgressNote, parseContextSnapshot } from "../extensions/workflow-runtime/session-context.ts";

test("open session classifies observed tools and shell commands, not quoted test names", () => {
  for (const name of ["read", "grep", "find", "ls", "web_search", "fetch_content"]) assert.equal(classifyTool(name, {}), "explore", name);
  for (const name of ["edit", "write"]) assert.equal(classifyTool(name, {}), "change");
  for (const command of ["rg test src", "git -C repo diff", "cat test.js", "sed -n '1,20p' file", "ls && git status"]) assert.equal(classifyTool("bash", { command }), "explore", command);
  for (const command of ["mv a b", "cp a b", "rm a", "git -C repo add a", "git commit -m test", "printf x > a", "echo x >>a"]) assert.equal(classifyTool("bash", { command }), "change", command);
  for (const command of ["uv run pytest -q", "npm test", "npm run typecheck", "npm run package:check", "node --test sum.test.js", "npx tsc --noEmit", "eslint src", "test -f file"]) assert.equal(classifyTool("bash", { command }), "verify", command);
  for (const command of ["echo 'npm test'", "sleep 8", "sed 's/a/b/' file"]) assert.equal(classifyTool("bash", { command }), undefined, command);
  assert.equal(classifyTool("bash", { command: "node --test; edit-other-file" }), "verify");
  assert.equal(classifyTool("bash", { command: "node --test && git add file" }), "change");
  assert.equal(classifyTool("ask_user_question", {}), undefined);
});

test("track follows finished calls, revisits stages, and reseeds only on a changed established goal", () => {
  const track = new OpenSessionTrack();
  assert.equal(track.lens(), undefined);
  track.start("r", "read", { path: "src/limits.ts" });
  assert.equal(track.lens().doing, "Reading src/limits.ts");
  assert.equal(track.lens().stages, undefined);
  track.finish("r");
  assert.deepEqual(track.lens().stages.map(s => s.state), ["active", "pending", "pending"]);
  assert.equal(track.lens().doing, undefined);
  track.goal("Debug limits", 0);
  track.beginTurn();
  track.start("w", "edit", {});
  track.finish("w");
  track.goal("Debug limits", 1);
  assert.deepEqual(track.lens().stages.map(s => s.state), ["done", "active", "pending"]);
  track.beginTurn();
  track.start("v", "bash", { command: "npm test" });
  track.finish("v");
  track.start("r2", "read", {});
  track.finish("r2");
  track.goal("Explain testing", 2);
  assert.deepEqual(track.lens().stages.map(s => s.state), ["active", "pending", "done"]);
  track.reset();
  assert.equal(track.lens(), undefined);
});

test("late first and changed goals keep the producing turn and newer observations", () => {
  const track = new OpenSessionTrack();
  track.start("r", "read", {});
  track.finish("r");
  track.beginTurn();
  track.start("w", "write", {});
  track.finish("w");
  track.goal("First goal", 0);
  assert.deepEqual(track.lens().stages.map(s => s.state), ["done", "active", "pending"]);
  track.beginTurn();
  track.start("v", "bash", { command: "npm test" });
  track.finish("v");
  track.goal("Second goal", 1);
  assert.deepEqual(track.lens().stages.map(s => s.state), ["pending", "done", "active"]);
});

test("open lens reuses runtime entry and yields to step and orchestration lenses", () => {
  const lens = { stages: [{ label: "explore", state: "active" }] };
  assert.deepEqual(withWorkflowDefinition({}, lens).lens, lens);
  assert.equal(withWorkflowDefinition({ activeStep: "execute" }, lens).lens.stages[0].label, "implement");
  const orchestrated = withWorkflowDefinition({ orchestration: { doing: "Coordinating", tickets: [{ id: "x-001", state: "queued" }] } }, lens);
  assert.equal(orchestrated.lens.doing, "Coordinating");
});

test("progress goal is optional, normalized, bounded and retained in snapshots", () => {
  const note = parseProgressNote(JSON.stringify({ goal: "  Debug\nlimits  ", done: "Read source" }));
  assert.deepEqual(note, { goal: "Debug limits", done: "Read source" });
  assert.equal([...parseProgressNote(JSON.stringify({ goal: "😀".repeat(90) })).goal].length, 80);
  assert.deepEqual(parseContextSnapshot({ version: 1, updatedAt: 1, progress: { ...note, updatedAt: 2 } }).progress, { ...note, updatedAt: 2 });
});
