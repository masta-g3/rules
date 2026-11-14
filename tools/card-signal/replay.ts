import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createHash } from "node:crypto";
import { CONTEXT_ENTRY_TYPE, parseContextSnapshot, normalizeText, recentTranscript } from "../../extensions/workflow-runtime/session-context.ts";

// Pi's persisted entries and RPC events are extensible records. Unknown types are ignored.
export type Entry = Record<string, any>;
export type Call = { id: string; name: string; args: Entry; short: string; start: number; end?: number; error?: boolean; turn: number; step?: string };
export type Turn = { start: number; end?: number; outcome?: string; user: string };
export type Moment = {
  at: number; until: number; running: boolean; known: boolean; turn: number; turnStart?: number;
  noteAt?: number; saidAt?: number; attentionAt?: number; saidSource?: "live" | "fallback";
  shown: { doing?: string; done?: string; next?: string; now?: string; said?: string; request?: string; roster?: { field: string; text: string } };
  actual: { tool?: string; assistant?: string; user?: string };
  raw: { doing?: string; done?: string; next?: string; step?: string };
};
export type Replay = { id: string; timeline: Moment[]; calls: Call[]; turns: Turn[]; notes: { at: number; updatedAt: number }[]; branch: Entry[]; exact: boolean };
export const text = (content: any): string => typeof content === "string" ? content : Array.isArray(content) ? content.filter(p => p?.type === "text" && typeof p.text === "string").map(p => p.text).join("\n") : "";
const time = (e: Entry): number => typeof e.at === "number" ? e.at : typeof e.timestamp === "number" ? e.timestamp : Date.parse(e.timestamp);
export const shortArg = (args: Entry): string => normalizeText(args?.path ?? args?.file_path ?? args?.command ?? args?.pattern ?? args?.stepId ?? args?.activityId ?? args?.ticketId ?? JSON.stringify(args), 160) ?? "";
export const jsonLines = (source: string): Entry[] => source.split("\n").filter(l => l.trim()).map(l => JSON.parse(l));

export function activeBranch(rows: Entry[]): Entry[] {
  const entries = rows.filter(e => e.type !== "session");
  if (!entries.some(e => "parentId" in e)) return entries; // Pi v1 linear sessions.
  const byId = new Map(entries.map(e => [e.id, e]));
  const branch: Entry[] = []; const seen = new Set();
  let current = entries.at(-1);
  while (current) {
    if (seen.has(current.id)) throw new Error("Cyclic session parent chain");
    seen.add(current.id); branch.push(current);
    if (current.parentId == null) break;
    const parent = byId.get(current.parentId);
    if (!parent) throw new Error(`Missing parent entry ${current.parentId}`);
    current = parent;
  }
  return branch.reverse();
}

// Mirrors Hub src/core/conversation.ts:lastAssistantText; Rules cannot import Hub.
export function lastAssistantText(branch: Entry[], maxChars = 600): string | undefined {
  for (let i = branch.length - 1; i >= 0; i--) {
    const e = branch[i];
    if (e.type !== "message") continue;
    if (e.message?.role === "user") return;
    if (e.message?.role !== "assistant" || e.message.stopReason === "pending") continue;
    const body = text(e.message.content).replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/gu, "").replace(/\x1bP[^\x1b]*(?:\x1b\\)/gu, "").replace(/\x1b\[[0-?]*[ -/]*[@-~]/gu, "").replace(/\x1b[@-_]/gu, "").replace(/\r\n?/gu, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/gu, "").trim();
    if (body) return [...body].length <= maxChars ? body : [...body].slice(0, maxChars).join("") + "…";
  }
}

export function replay(rows: Entry[], events: Entry[] = []): Replay {
  const branch = activeBranch(rows);
  const timed = branch.filter(e => Number.isFinite(time(e)));
  const turns: Turn[] = []; const calls: Call[] = []; const notes: Replay["notes"] = [];
  const callsById = new Map<string, Call>(); const noteIds = new Set<number>();
  let step: string | undefined;
  for (const e of timed) {
    const at = time(e); const m = e.message;
    if (e.customType === "workflow-runtime") step = e.data?.activeStep;
    if (e.customType === CONTEXT_ENTRY_TYPE) {
      const p = parseContextSnapshot(e.data)?.progress;
      if (p && !noteIds.has(p.updatedAt)) { notes.push({ at, updatedAt: p.updatedAt }); noteIds.add(p.updatedAt); }
    }
    if (e.type !== "message") continue;
    if (m?.role === "user") turns.push({ start: at, user: normalizeText(text(m.content), 400) ?? "" });
    if (m?.role === "assistant") {
      for (const c of Array.isArray(m.content) ? m.content : []) if (c.type === "toolCall") {
        const call = { id: c.id, name: c.name, args: c.arguments ?? {}, short: `${c.name} ${shortArg(c.arguments ?? {})}`.trim(), start: at, turn: turns.length - 1, step };
        calls.push(call); callsById.set(c.id, call);
      }
      if (["stop", "aborted", "error", "length"].includes(m.stopReason) && turns.length) Object.assign(turns.at(-1)!, { end: at, outcome: m.stopReason });
    }
    if (m?.role === "toolResult") {
      const call = callsById.get(m.toolCallId);
      if (call) { call.end = at; call.error = m.isError === true; }
    }
  }
  // RPC clocks mark execution, unlike serialized assistant messages with multiple calls.
  for (const e of events) {
    const call = callsById.get(e.toolCallId);
    if (call && e.type === "tool_execution_start") call.start = time(e);
    if (call && e.type === "tool_execution_end") { call.end = time(e); call.error = e.isError === true; }
  }
  const lifecycle = events.filter(e => ["agent_start", "agent_end", "agent_settled"].includes(e.type) && Number.isFinite(time(e)));
  const boundaries = [...new Set([...timed.map(time), ...calls.flatMap(c => c.end === undefined ? [c.start] : [c.start, c.end]), ...lifecycle.map(time)])].sort((a, b) => a - b);
  const timeline: Moment[] = [];
  let index = 0; let turn = -1; let context: ReturnType<typeof parseContextSnapshot>; let workflow: Entry = {};
  let said: string | undefined; let saidAt: number | undefined; let attentionAt: number | undefined; let previousAttention: string | undefined;
  let noteAt: number | undefined; let previousNote: number | undefined; let error: string | undefined;
  // Entries on a branch are in append order, with monotonically recorded ISO times.
  for (let b = 0; b < boundaries.length; b++) {
    const at = boundaries[b];
    while (index < timed.length && time(timed[index]) <= at) {
      const e = timed[index++]; const m = e.message;
      if (e.customType === CONTEXT_ENTRY_TYPE) {
        context = parseContextSnapshot(e.data);
        if (context?.progress?.updatedAt !== previousNote) { noteAt = context?.progress?.updatedAt; previousNote = context?.progress?.updatedAt; }
        const key = JSON.stringify(context?.attention);
        if (key !== previousAttention) { attentionAt = time(e); previousAttention = key; }
      }
      if (e.customType === "workflow-runtime") workflow = e.data ?? {};
      if (e.type === "message" && m?.role === "user") { turn++; said = undefined; saidAt = undefined; error = undefined; }
      if (e.type === "message" && m?.role === "assistant") {
        if (m.stopReason !== "pending" && text(m.content).trim()) { said = lastAssistantText([e]); saidAt = time(e); }
        if (m.stopReason === "error") error = normalizeText(m.errorMessage, 160);
      }
    }
    const t = turns[turn];
    const latestLifecycle = lifecycle.findLast(e => time(e) <= at);
    const running = latestLifecycle ? latestLifecycle.type === "agent_start" : !!t && (t.end === undefined || at < t.end);
    const current = calls.filter(c => c.start <= at && at < (c.end ?? turns[c.turn]?.end ?? turns[c.turn + 1]?.start ?? Infinity));
    const unknown = calls.some(c => c.start <= at && c.end === undefined && at < (turns[c.turn]?.end ?? turns[c.turn + 1]?.start ?? Infinity));
    const latestCall = calls.filter(c => c.end !== undefined && c.end <= at).sort((a,b) => a.end! - b.end!).at(-1);
    const question = current.find(c => c.name === "ask_user_question");
    // Fresh requests need an ID. Legacy attention text is only a quiet fallback in Hub.
    const attention = !running && context?.attention?.requestId ? context.attention : undefined;
    const firstQuestion = question?.args.questions?.[0];
    const request = question ? { kind: "question", text: normalizeText(`${firstQuestion?.header ?? ""} ${firstQuestion?.question ?? ""}`, 150) ?? shortArg(question.args) } : attention;
    const doing = workflow.lens?.doing;
    const done = context?.progress?.done; const next = context?.progress?.next;
    const fallback = !said && !request && !running ? context?.attention?.text : undefined;
    const now = running ? current[0]?.short : undefined;
    const roster = request ? { field: request.kind === "question" ? "ASK" : request.kind === "ready" ? "RDY" : "BLK", text: request.text }
      : error ? { field: "ERR", text: error } : doing ? { field: "DOING", text: doing }
      : running && (now || latestCall) ? { field: "NOW", text: now ?? latestCall!.short }
      : done ? { field: "DONE", text: done } : context?.attention?.text ? { field: "SAID", text: context.attention.text }
      : context?.ticket?.subtitle || context?.ticket?.description ? { field: "TASK", text: context.ticket.subtitle ?? context.ticket.description! } : undefined;
    timeline.push({ at, until: boundaries[b + 1] ?? at, running, known: !unknown, turn, turnStart: t?.start, noteAt,
      saidAt: said ? saidAt : fallback ? attentionAt : undefined, attentionAt, saidSource: said ? "live" : fallback ? "fallback" : undefined,
      shown: { doing, done: !doing && request?.kind !== "ready" ? done : undefined, next: !doing && !request ? next : undefined, now, said: said ?? fallback, request: request?.text, roster },
      actual: { tool: current[0]?.short ?? latestCall?.short, assistant: said, user: t?.user },
      raw: { doing, done, next, step: workflow.activeStep },
    });
  }
  return { id: createHash("sha256").update(String(rows.find(e => e.type === "session")?.id ?? JSON.stringify(rows))).digest("hex").slice(0, 16), timeline, calls, turns, notes, branch, exact: lifecycle.length > 0 };
}

export function shownAt(run: Replay, at: number): Moment {
  const found = run.timeline.findLast(m => m.at <= at);
  if (!found) throw new Error("Time precedes the session");
  return found;
}

export function replayFile(file: string): Replay {
  const eventFile = join(dirname(file), "events.jsonl");
  return replay(jsonLines(readFileSync(file, "utf8")), existsSync(eventFile) ? jsonLines(readFileSync(eventFile, "utf8")) : []);
}

// For inspecting the producer input without introducing a second transcript builder.
export const progressInput = (run: Replay, at: number) => recentTranscript(run.branch.filter(e => time(e) <= at));
