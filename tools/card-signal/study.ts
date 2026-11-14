#!/usr/bin/env node
import { readdir, stat, mkdir, readFile, writeFile, realpath } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { replayFile, replay, jsonLines, text, type Replay } from "./replay.ts";
import { metrics } from "./metrics.ts";
import { sampleMoments, judgeSamples, verdictCounts } from "./judge.ts";
import { aggregateMetrics, summaryReport } from "./cli.ts";

const { values } = parseArgs({ options: { mocks: { type: "string" }, out: { type: "string" }, "mock-out": { type: "string" }, sample: { type: "string", default: "120" } } });
if (!values.mocks || !values.out || !values["mock-out"]) throw new Error("Usage: study.ts --mocks <raw-mock-dir> --out <temporary-real-dir> --mock-out <artifact-dir> [--sample 120]");
const out = resolve(values.out); await mkdir(out, { recursive: true });
if (!(await realpath(out)).startsWith((await realpath("/tmp")) + sep)) throw new Error("Study real output must be below /tmp");
const mockOut = resolve(values["mock-out"]); await mkdir(mockOut, { recursive: true });
const mockRuns: Replay[] = []; const manifests = [];
for (const folder of (await readdir(values.mocks)).sort()) {
  const file = join(values.mocks, folder, "run.json");
  let manifest;
  try { manifest = JSON.parse(await readFile(file, "utf8")); } catch (e: any) { if (["ENOENT", "ENOTDIR"].includes(e.code)) continue; throw e; }
  if (manifest.status !== "complete") throw new Error(`Incomplete mock ${folder}`);
  mockRuns.push(replayFile(manifest.sessionFile));
  manifests.push({ scenario: manifest.scenario, model: manifest.model, session: manifest.session, notes: manifest.progressEntries, workflowEntries: manifest.workflowEntries, turns: manifest.turns });
}
if (mockRuns.length < 13) throw new Error(`Only ${mockRuns.length} completed mocks; need 13`);
const sessionRoot = join(homedir(), ".pi/agent/sessions");
const files: { file: string; mtime: number; directory: string }[] = [];
for (const directory of await readdir(sessionRoot)) {
  const dir = join(sessionRoot, directory);
  if (!(await stat(dir)).isDirectory()) continue;
  for (const name of await readdir(dir)) if (name.endsWith(".jsonl")) {
    const file = join(dir, name); files.push({ file, mtime: (await stat(file)).mtimeMs, directory });
  }
}
const realRuns: Replay[] = []; const selection: any[] = []; let skippedSubagent = 0; let ineligible = 0;
for (const candidate of files.sort((a,b) => b.mtime - a.mtime)) {
  const source = await readFile(candidate.file, "utf8"); const rows = jsonLines(source);
  const isChild = rows.some(e => e.type === "message" && (
    e.message?.role === "user" && /^<file name="[^"]*\/pi-tmux-subagents\/jobs\//.test(text(e.message.content)) ||
    e.message?.role === "system" && JSON.stringify(e.message.sections ?? e.message.content).includes("You are a child subagent launched from a parent Pi session")
  ));
  if (isChild) { skippedSubagent++; continue; }
  const run = replay(rows);
  if (!run.notes.length || run.calls.length < 10) { ineligible++; continue; }
  realRuns.push(run);
  selection.push({ session: run.id, directoryHash: createHash("sha256").update(candidate.directory).digest("hex").slice(0,16), mtime: candidate.mtime, notes: run.notes.length, calls: run.calls.length });
  // A local-only snapshot makes exact reruns possible while real source files remain read-only.
  await writeFile(join(out, `${run.id}.jsonl`), source);
  if (realRuns.length === 25) break;
}
if (realRuns.length < 20) throw new Error(`Only ${realRuns.length} eligible real sessions; need 20`);
await writeFile(join(out, "selection.json"), JSON.stringify({ skippedSubagent, ineligible, sessions: selection }, null, 2) + "\n");
const count = Number(values.sample);
if (!Number.isSafeInteger(count) || count < 100) throw new Error("Study --sample must be at least 100");
const allSamples = sampleMoments([...mockRuns, ...realRuns], count);
// Partition without changing global sampling weights; never copy real inputs into mock output.
const mockIds = new Set(mockRuns.map(r => r.id));
for (const [runs, destination, real] of [[mockRuns, mockOut, false], [realRuns, out, true]] as const) {
  const samples = allSamples.filter(s => mockIds.has(s.session) !== real);
  const scored = await judgeSamples(samples, destination);
  const perSession = runs.map(metrics); const aggregate = aggregateMetrics(perSession);
  await writeFile(join(destination, "timeline.jsonl"), runs.flatMap(r => r.timeline.map(m => JSON.stringify({ session: r.id, ...m }))).join("\n") + "\n");
  await writeFile(join(destination, "metrics.json"), JSON.stringify({ aggregate, sessions: perSession, verdicts: verdictCounts(scored) }, null, 2) + "\n");
  await writeFile(join(destination, "verdicts.jsonl"), scored.map(s => JSON.stringify(s)).join("\n") + "\n");
  await writeFile(join(destination, "report.md"), summaryReport(aggregate, scored, real));
  console.log(JSON.stringify({ kind: real ? "real" : "mock", sessions: runs.length, samples: scored.length }));
}
await writeFile(join(mockOut, "runs.json"), JSON.stringify(manifests, null, 2) + "\n");
// Safe to publish: numeric metrics and opaque directory hashes only, no raw field values or reasons.
await writeFile(join(out, "publishable.json"), JSON.stringify({ selection, aggregate: aggregateMetrics(realRuns.map(metrics)), verdicts: JSON.parse(await readFile(join(out, "metrics.json"), "utf8")).verdicts }, null, 2) + "\n");
