import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const cli = resolve("tools/card-signal/cli.ts");
const source = [
  { type: "session", id: "test-session", version: 3 },
  { type: "message", id: "u", parentId: null, timestamp: "2026-01-01T00:00:00Z", message: { role: "user", content: "PRIVATE_CANARY" } },
  { type: "message", id: "a", parentId: "u", timestamp: "2026-01-01T00:00:01Z", message: { role: "assistant", content: [{ type: "text", text: "PRIVATE_CANARY" }], stopReason: "stop" } },
].map(e => JSON.stringify(e)).join("\n") + "\n";

test("CLI writes replay artifacts and blocks real-source output outside temporary storage", async () => {
  const root = await mkdtemp(join(tmpdir(), "card-cli-test-"));
  const nonTemp = await mkdtemp(resolve("agent-work/card-cli-test-"));
  try {
    const session = join(root, ".pi/agent/sessions/project/test.jsonl");
    await mkdir(join(root, ".pi/agent/sessions/project"), { recursive: true });
    await writeFile(session, source);
    const out = join(root, "output");
    const env = { ...process.env, HOME: root };
    execFileSync(process.execPath, ["--experimental-strip-types", cli, "replay", session, "--out", out], { env });
    assert.equal(JSON.parse(await readFile(join(out, "metrics.json"), "utf8")).aggregate.turns, 1);
    assert.ok((await readFile(join(out, "timeline.jsonl"), "utf8")).includes("PRIVATE_CANARY"));
    assert.equal((await readFile(join(out, "report.md"), "utf8")).includes("PRIVATE_CANARY"), false);
    const bad = spawnSync(process.execPath, ["--experimental-strip-types", cli, "replay", session, "--out", nonTemp], { env, encoding: "utf8" });
    assert.notEqual(bad.status, 0);
    assert.match(bad.stderr, /output must be below a system temporary directory/);
  } finally { await rm(root, { recursive: true }); await rm(nonTemp, { recursive: true }); }
});
