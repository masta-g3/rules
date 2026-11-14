import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { sampleMoments, parseVerdict, judgeSamples } from "../tools/card-signal/judge.ts";
import { replay } from "../tools/card-signal/replay.ts";

function run(id) {
  const rows = [{ type: "session", id }]; let parentId = null;
  for (let i = 0; i < 12; i++) {
    const e = { type: "message", id: `${i}`, parentId, timestamp: new Date(1700000000000 + i * 2000).toISOString(), message: { role: i % 3 === 0 ? "user" : "assistant", content: i % 3 === 0 ? "Fix task" : [{ type: "text", text: `Action ${i}` }], stopReason: i % 3 === 2 ? "stop" : "toolUse" } };
    rows.push(e); parentId = e.id;
  }
  return replay(rows);
}
const valid = { doing: "n/a", next: "n/a", done: "n/a", said: "match", roster: "n/a", reason: "Current message" };

test("seeded sampling is deterministic, capped, covers sessions and turn strata", () => {
  const runs = [run("one"), run("two")];
  const samples = sampleMoments(runs, 12, "seed");
  assert.deepEqual(samples, sampleMoments(runs, 12, "seed"));
  assert.notDeepEqual(samples, sampleMoments(runs, 12, "different"));
  assert.equal(samples.length, 12);
  assert.equal(new Set(samples.map(s => s.session)).size, 2);
  assert.equal(new Set(samples.map(s => s.phase)).size, 3);
  assert.equal(new Set(samples.map(s => s.hash)).size, 12);
});

test("verdict parser rejects malformed, unsupported and incomplete values", () => {
  assert.deepEqual(parseVerdict(JSON.stringify(valid)), valid);
  assert.equal(parseVerdict("not JSON"), undefined);
  assert.equal(parseVerdict(JSON.stringify({ ...valid, said: "maybe" })), undefined);
  assert.equal(parseVerdict(JSON.stringify({ said: "match" })), undefined);
  assert.equal(parseVerdict(JSON.stringify({ ...valid, reason: "x".repeat(141) })), undefined);
  assert.equal(parseVerdict(JSON.stringify({ ...valid, done: "unclear" })).done, "unclear");
});

test("content-addressed cache avoids new calls; hidden fields are forced n/a", async () => {
  const dir = await mkdtemp(join(tmpdir(), "card-judge-test-"));
  let calls = 0;
  const model = async () => { calls++; return JSON.stringify({ ...valid, doing: "wrong" }); };
  try {
    const samples = sampleMoments([run("one")], 5);
    const first = await judgeSamples(samples, dir, model);
    assert.equal(calls, 5);
    assert.ok(first.every(v => v.verdict.doing === "n/a"));
    const second = await judgeSamples(samples, dir, async () => { throw new Error("cache missed"); });
    assert.deepEqual(second, first);
  } finally { await rm(dir, { recursive: true }); }
});

test("bad model output fails explicitly and is not cached", async () => {
  const dir = await mkdtemp(join(tmpdir(), "card-judge-test-"));
  try { await assert.rejects(judgeSamples(sampleMoments([run("one")], 1), dir, async () => "bad"), /Invalid judge verdict/); }
  finally { await rm(dir, { recursive: true }); }
});
