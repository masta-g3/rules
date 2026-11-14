#!/usr/bin/env node
import { mkdir, writeFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { tmpdir, homedir } from "node:os";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { replayFile } from "./replay.ts";
import { metrics, distribution } from "./metrics.ts";
import { FIELDS, sampleMoments, judgeSamples, verdictCounts, type Scored } from "./judge.ts";

export function aggregateMetrics(items: ReturnType<typeof metrics>[]) {
  const sum = (key: string) => items.reduce((n, m) => n + (m as any)[key], 0);
  const dist = (key: string) => distribution(items.flatMap(m => (m as any)[key].values));
  const wall = sum("bounded_wall_s");
  const ratio = (a: number, b: number) => b ? a/b : null;
  const cadence = items.flatMap(m => m.execute_cadence);
  const cadenceSum = (key: "checkbox_updates" | "tool_calls" | "plan_edit_calls" | "tasks_ticked" | "ticks_in_final_tenth" | "updates_without_attributed_plan_edit" | "explicit_plan_edit_calls" | "shell_plan_update_calls") => cadence.reduce((n,r) => n + r[key], 0);
  const intervals = cadence.flatMap(r => r.update_interval_s.values);
  const tickSizes = cadence.flatMap(r => r.tasks_ticked_per_update.values);
  return {
    sessions: items.length, turns: sum("turns"), tool_calls: sum("tool_calls"), turns_without_note: sum("turns_without_note"),
    incomplete_turns: sum("incomplete_turns"), unknown_tool_intervals: sum("unknown_tool_intervals"), unknown_wall_s: sum("unknown_wall_s"), bounded_wall_s: wall,
    note_lag_s: dist("note_lag_s"), note_age_at_action_s: dist("note_age_at_action_s"),
    note_older_than_turn_share: ratio(sum("note_older_than_turn_count"), items.reduce((n,m) => n + m.note_age_at_action_s.n, 0)),
    stale_turn_share: ratio(sum("stale_next_s"), wall), stale_next_visible_share: ratio(sum("stale_next_s"), sum("next_visible_s")),
    doing_task_lag_s: dist("doing_task_lag_s"), edits_without_observed_checkbox: sum("edits_without_observed_checkbox"),
    said_narration_age_s: dist("said_narration_age_s"), said_narration_stale_action_share: ratio(sum("said_narration_before_previous_tool_end"), items.reduce((n,m) => n + m.said_narration_age_s.n, 0)),
    said_fallback_share: ratio(sum("said_fallback_s"), wall), said_fallback_predates_user_s: sum("said_fallback_predates_user_s"), said_fallback_predates_user_episodes: sum("said_fallback_predates_user_episodes"),
    field_dwell_s: Object.fromEntries(["doing", "next", "said"].map(f => [f, distribution(items.flatMap(m => m.field_dwell_s[f].map(d => d.seconds)))])),
    execute_cadence: {
      sessions: items.filter(m => m.execute_cadence.length).length, runs: cadence.length,
      closed_runs: cadence.filter(r => r.closed).length, terminal_response_runs: cadence.filter(r => r.terminal_response).length,
      zero_update_runs: cadence.filter(r => !r.checkbox_updates).length,
      checkbox_updates: cadenceSum("checkbox_updates"), updates_without_attributed_plan_edit: cadenceSum("updates_without_attributed_plan_edit"),
      update_interval_s: { ...distribution(intervals), max: intervals.length ? Math.max(...intervals) : null },
      tasks_ticked_per_update: distribution(tickSizes), single_task_updates: tickSizes.filter(n => n === 1).length,
      burst_updates: tickSizes.filter(n => n > 1).length, reopen_updates: tickSizes.filter(n => n === 0).length,
      phase_alignment_known_updates: cadence.flatMap(r => r.updates).filter(u => u.phases_completed !== null).length,
      phase_checkpoint_updates: cadence.flatMap(r => r.updates).filter(u => u.phases_completed !== null && u.phases_completed > 0).length,
      whole_phase_burst_updates: cadence.flatMap(r => r.updates).filter(u => u.whole_phases_ticked !== null && u.whole_phases_ticked > 0).length,
      tasks_ticked: cadenceSum("tasks_ticked"), ticks_in_final_tenth: cadenceSum("ticks_in_final_tenth"),
      ticks_in_final_tenth_share: ratio(cadenceSum("ticks_in_final_tenth"), cadenceSum("tasks_ticked")),
      end_plan_completeness: { complete: cadence.filter(r => r.all_plan_tasks_checked_at_end === true).length, incomplete: cadence.filter(r => r.all_plan_tasks_checked_at_end === false).length, unknown: cadence.filter(r => r.all_plan_tasks_checked_at_end === null).length },
      finished_tasks_all_ticked: { confirmed: cadence.filter(r => r.finished_tasks_all_ticked === true).length, unknown: cadence.filter(r => r.finished_tasks_all_ticked === null).length },
      tool_calls: cadenceSum("tool_calls"), plan_edit_calls: cadenceSum("plan_edit_calls"),
      explicit_plan_edit_calls: cadenceSum("explicit_plan_edit_calls"), shell_plan_update_calls: cadenceSum("shell_plan_update_calls"),
      plan_edit_tool_call_share: ratio(cadenceSum("plan_edit_calls"), cadenceSum("tool_calls")),
      plan_edit_duration_s: distribution(cadence.flatMap(r => r.plan_edit_duration_s.values)),
      last_code_change_to_tick_s: distribution(cadence.flatMap(r => r.last_code_change_to_tick_s.values)),
    },
  };
}

export function summaryReport(aggregate: ReturnType<typeof aggregateMetrics>, scored: Scored[], real = false): string {
  const counts = verdictCounts(scored);
  let report = `# Card signal replay\n\n${aggregate.sessions} sessions; ${scored.length} judged moments. ${real ? "Real inputs: aggregate output only; raw artifacts stay in temporary storage." : "Mock inputs: reviewable examples below."}\n\n`;
  report += "Entry times estimate display times (heartbeat coalescing ≤750 ms). SAID assumes a selected session and ≤1 s polling delay. Requests assume unread; selection/acknowledgement are unknown. Timeline rows are lossless run-length intervals, queryable at each second. Tool/running intervals use RPC events where available; unbounded tools are unknown and excluded from wall-time rates.\n\n";
  report += "| Field | Match | Stale | Wrong | Unclear | n/a |\n|---|---:|---:|---:|---:|---:|\n";
  for (const f of FIELDS) report += `| ${f.toUpperCase()} | ${Object.values(counts[f]).join(" | ")} |\n`;
  report += `\n## Timing\n\n\`\`\`json\n${JSON.stringify(aggregate, null, 2)}\n\`\`\`\n`;
  if (!real) {
    report += "\n## Mock spot checks (seeded sample)\n";
    for (const s of [...scored].sort((a,b) => createHash("sha256").update("spot-check" + a.hash).digest("hex").localeCompare(createHash("sha256").update("spot-check" + b.hash).digest("hex"))).slice(0, 10)) report += `\n### ${s.session} @ ${new Date(s.at).toISOString()}\n\n\`\`\`json\n${JSON.stringify({ input: s.input, verdict: s.verdict }, null, 2)}\n\`\`\`\n`;
  }
  return report;
}

export async function main(args = process.argv.slice(2)) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    out: { type: "string" }, judge: { type: "boolean", default: false }, sample: { type: "string", default: "120" }, seed: { type: "string", default: "card-signal-001" }, real: { type: "boolean", default: false },
  } });
  if (positionals.shift() !== "replay" || !positionals.length || !values.out) throw new Error("Usage: cli.ts replay <files…> --out <dir> [--judge] [--sample N] [--real]");
  const count = Number(values.sample);
  if (!Number.isSafeInteger(count) || count < 1) throw new Error("--sample must be a positive integer");
  let sourceRoot = resolve(homedir(), ".pi/agent/sessions");
  try { sourceRoot = await realpath(sourceRoot); } catch (e: any) { if (e.code !== "ENOENT") throw e; }
  sourceRoot += sep;
  const inputPaths = await Promise.all(positionals.map(p => realpath(p)));
  const real = values.real || inputPaths.some(p => p.startsWith(sourceRoot));
  const out = resolve(values.out); await mkdir(out, { recursive: true });
  if (real) {
    const actual = await realpath(out);
    const roots = await Promise.all([tmpdir(), "/tmp"].map(p => realpath(p)));
    if (!roots.some(root => actual.startsWith(root + sep))) throw new Error("--real output must be below a system temporary directory");
  }
  const runs = positionals.map(replayFile);
  const perSession = runs.map(metrics); const aggregate = aggregateMetrics(perSession);
  const scored = values.judge ? await judgeSamples(sampleMoments(runs, count, values.seed), out) : [];
  await writeFile(resolve(out, "timeline.jsonl"), runs.flatMap(r => r.timeline.map(m => JSON.stringify({ session: r.id, ...m }))).join("\n") + "\n");
  await writeFile(resolve(out, "metrics.json"), JSON.stringify({ aggregate, sessions: perSession, verdicts: verdictCounts(scored) }, null, 2) + "\n");
  await writeFile(resolve(out, "verdicts.jsonl"), scored.map(s => JSON.stringify(s)).join("\n") + "\n");
  await writeFile(resolve(out, "report.md"), summaryReport(aggregate, scored, real));
  console.log(JSON.stringify({ out, sessions: runs.length, samples: scored.length }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
