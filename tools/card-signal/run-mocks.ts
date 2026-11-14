#!/usr/bin/env node
import { spawn, execFileSync } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { setTimeout as sleep } from "node:timers/promises";
import { jsonLines, replayFile } from "./replay.ts";

const here = dirname(fileURLToPath(import.meta.url));
const { values } = parseArgs({ options: {
  out: { type: "string" }, scenario: { type: "string" }, model: { type: "string" },
  "question-extension": { type: "string" }, "claude-extension": { type: "string" },
  pi: { type: "string", default: "pi" },
} });
if (!values.out || !values["question-extension"]) throw new Error("Usage: run-mocks.ts --out <temporary-dir> --question-extension <path> [--claude-extension <path>] [--scenario 1] [--model openai/gpt-6.1-sol]");
const out = resolve(values.out); await mkdir(out, { recursive: true });
const scenarios = (await readdir(join(here, "scenarios"))).sort();
const matrix = [
  ...[1,2,3,4,5,6,7].map(s => ({ scenario: s, model: "openai/gpt-6.1-sol" })),
  ...[1,2,4,6].map(s => ({ scenario: s, model: "openai/gpt-6.1-terra" })),
  ...[1,4].map(s => ({ scenario: s, model: "claude-code/claude-opus-5-5" })),
];
const selected = matrix.filter(r => (!values.scenario || r.scenario === Number(values.scenario)) && (!values.model || r.model === values.model));
if (!selected.length) throw new Error("No agreed scenario/model matches the filters");
for (const spec of selected) {
  const name = `${spec.scenario}-${spec.model.replaceAll("/", "-")}`;
  const runDir = join(out, name); const manifestFile = join(runDir, "run.json");
  if (existsSync(manifestFile) && JSON.parse(readFileSync(manifestFile, "utf8")).status === "complete") { console.log(`skip ${name}`); continue; }
  if (existsSync(runDir)) throw new Error(`Incomplete run retained at ${runDir}; inspect it before retrying (budget safety)`);
  if (spec.model.startsWith("claude-code/") && !values["claude-extension"]) throw new Error("--claude-extension is required for claude-code runs");
  await mkdir(runDir); const cwd = join(runDir, "project"); await cp(join(here, "fixture"), cwd, { recursive: true });
  execFileSync("git", ["init", "-q"], { cwd });
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("PI_AGENT_HUB_") || key.startsWith("PI_TMUX_SUBAGENTS_") || ["PI_SESSION_ID", "PI_SESSION_FILE", "PI_CODING_AGENT_SESSION_DIR"].includes(key)) delete env[key];
  const args = ["--mode", "rpc", "--no-extensions", "--no-mcp", "--no-skills", "--no-prompt-templates", "--no-context-files", "--no-themes", "--offline", "--session-dir", join(runDir, "sessions"),
    "--model", spec.model, "--thinking", "low", "-e", resolve(here, "../../extensions/workflow-runtime/index.ts"), "-e", resolve(values["question-extension"]),
    "--skill", join(cwd, "skills"), "--append-system-prompt", "This is an isolated card-signal study fixture. Work only within this working directory. Do not access credentials, other projects, or real user data. Do not commit, deploy, or launch subagents. The scenario prompt authorizes the stated fixture work. Give short factual progress narration and a short final answer."];
  if (spec.model.startsWith("claude-code/")) args.push("-e", resolve(values["claude-extension"]!));
  const events: any[] = []; let buffer = ""; let ended = false; let fatal: Error | undefined; let sequence = 0;
  const child = spawn(values.pi!, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  const eventFile = join(runDir, "events.jsonl"); const stderrFile = join(runDir, "stderr.log");
  child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => {
    buffer += chunk;
    for (;;) {
      const end = buffer.indexOf("\n"); if (end < 0) break;
      const line = buffer.slice(0, end).replace(/\r$/, ""); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      try {
        const e = { ...JSON.parse(line), at: Date.now() };
        appendFileSync(eventFile, JSON.stringify(e) + "\n");
        if (e.type !== "message_update" && e.type !== "tool_execution_update") events.push(e);
        if (e.type === "extension_error") fatal = new Error(`Extension error: ${e.error}`);
      } catch (error) { fatal = error as Error; }
    }
  });
  child.stderr.on("data", chunk => appendFileSync(stderrFile, chunk));
  child.on("error", error => { fatal = error; }); child.on("close", () => { ended = true; });
  const waitFor = async (predicate: (e: any) => boolean, from = 0, timeout = 180_000): Promise<any> => {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (fatal) throw fatal;
      const found = events.slice(from).find(predicate); if (found) return found;
      if (ended) throw new Error(`Pi exited unexpectedly; inspect ${stderrFile}`);
      await sleep(50);
    }
    throw new Error(`RPC deadline exceeded for ${name}`);
  };
  const send = async (record: any) => { await new Promise<void>((done, reject) => child.stdin.write(JSON.stringify(record) + "\n", error => error ? reject(error) : done())); };
  const command = async (record: any) => {
    const id = `study-${++sequence}`; const from = events.length; await send({ ...record, id });
    const response = await waitFor(e => e.type === "response" && e.id === id, from, 90_000);
    if (!response.success) throw new Error(`RPC ${record.type} failed: ${response.error}`);
    return response.data;
  };
  const manifest: any = { ...spec, status: "running", startedAt: new Date().toISOString(), turns: [] };
  await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`start ${name}`);
  try {
    await command({ type: "get_state" });
    await command({ type: "prompt", message: "/wf-clear" });
    if ([4,5].includes(spec.scenario)) await command({ type: "prompt", message: "/wf-ticket fixture-001" });
    const source = await readFile(join(here, "scenarios", scenarios.find(s => s.startsWith(`${spec.scenario}-`))!), "utf8");
    const prompts = source.trim().split("\n---turn---\n");
    for (let i = 0; i < prompts.length; i++) {
      const from = events.length; const startedAt = Date.now();
      const response = await command({ type: "prompt", message: prompts[i] });
      if (response?.disposition === "handled") throw new Error("Scenario prompt unexpectedly handled without an agent run");
      if (spec.scenario === 3 && i === 1) {
        const question = await waitFor(e => e.type === "extension_ui_request" && e.method === "select", from);
        await sleep(20_000);
        await send({ type: "extension_ui_response", id: question.id, value: question.options[0] });
      }
      if (spec.scenario === 7 && i === 0) {
        await waitFor(e => e.type === "tool_execution_start" && e.toolName === "bash", from);
        await sleep(2_000); await command({ type: "abort" });
      }
      const settled = await waitFor(e => e.type === "agent_settled", from, 300_000);
      const failed = events.slice(from).find(e => e.type === "message_end" && e.message?.role === "assistant" && e.message.stopReason === "error");
      if (failed) throw new Error(`Model run failed: ${failed.message.errorMessage}`);
      const state = await command({ type: "get_state" });
      if (!state.sessionFile) throw new Error("Pi did not persist a session file");
      let note = false; let metadataFailure = false;
      if (!settled.aborted) {
        const deadline = Date.now() + 30_000;
        while (Date.now() < deadline) {
          const rows = jsonLines(await readFile(state.sessionFile, "utf8"));
          note = rows.some(e => e.customType === "pi-agent-hub-context" && e.data?.progress?.updatedAt >= startedAt && e.data.progress.updatedAt >= settled.at - 1000);
          metadataFailure = events.slice(from).some(e => e.type === "extension_ui_request" && e.method === "notify" && /metadata.*(?:failed|invalid)/i.test(e.message ?? "") && e.at >= settled.at - 1000);
          if (note || metadataFailure) break;
          await sleep(100);
        }
      }
      manifest.turns.push({ startedAt, endedAt: settled.at, aborted: settled.aborted, note, metadataFailure });
      manifest.sessionFile = state.sessionFile;
      await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
    }
    const run = replayFile(manifest.sessionFile);
    manifest.status = "complete"; manifest.session = run.id; manifest.progressEntries = run.notes.length;
    manifest.workflowEntries = run.branch.filter(e => e.customType === "workflow-runtime").length;
    manifest.finishedAt = new Date().toISOString();
    console.log(`done ${name}: ${manifest.progressEntries} notes, ${run.calls.length} tools`);
  } catch (error) {
    manifest.status = "failed"; manifest.error = String(error); throw error;
  } finally {
    await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
    child.stdin.end();
    const deadline = Date.now() + 20_000;
    while (!ended && Date.now() < deadline) await sleep(100);
    if (!ended) child.kill("SIGTERM");
  }
  // Put RPC evidence beside the session where replayFile discovers it.
  await cp(eventFile, join(dirname(manifest.sessionFile), "events.jsonl"));
}
