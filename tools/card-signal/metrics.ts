import { shownAt, type Replay } from "./replay.ts";

export function distribution(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) => sorted.length ? sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] : null;
  return { n: values.length, median: q(.5), p90: q(.9), values };
}
const share = (n: number, d: number) => d ? n / d : null;
const isPlanEdit = (call: Replay["calls"][number]) => ["edit", "write"].includes(call.name) && /(?:^|\/)agent-work\/plans\/.*\.md$/.test(String(call.args.path ?? ""));

export function executeCadence(run: Replay) {
  type Tasks = { completed: number; total: number };
  type Snapshot = { at: number; tasks?: Tasks; phases?: Tasks[] };
  const counts = (value: any): Tasks | undefined => Number.isInteger(value?.completed) && Number.isInteger(value?.total) && value.completed >= 0 && value.total >= value.completed ? { completed: value.completed, total: value.total } : undefined;
  const windows: { start: number; limit?: number; ticketId?: string; snapshots: Snapshot[] }[] = [];
  let active: typeof windows[number] | undefined;
  for (const e of run.branch) {
    if (e.customType !== "workflow-runtime") continue;
    const at = Date.parse(e.timestamp);
    if (!Number.isFinite(at)) continue;
    if (e.data?.activeStep !== "execute") {
      if (active) active.limit = at;
      active = undefined;
      continue;
    }
    if (active && active.ticketId !== e.data?.ticketId) { active.limit = at; active = undefined; }
    if (!active) { active = { start: at, ticketId: e.data?.ticketId, snapshots: [] }; windows.push(active); }
    const tasks = counts(e.data?.plan?.tasks);
    const rawPhases = e.data?.plan?.phases;
    const phases = Array.isArray(rawPhases) && rawPhases.every(p => counts(p)) ? rawPhases.map(p => counts(p)!) : undefined;
    active.snapshots.push({ at, ...(tasks ? { tasks } : {}), ...(phases?.length ? { phases } : {}) });
  }
  return windows.map(window => {
    const limit = window.limit ?? Infinity;
    const calls = run.calls.filter(c => c.step === "execute" && c.start >= window.start && c.start < limit);
    const planEdits = calls.filter(isPlanEdit);
    const codeEdits = calls.filter(c => ["edit", "write"].includes(c.name) && !isPlanEdit(c) && c.end !== undefined && !c.error);
    const updates: { at: number; delta: number; tasks_ticked: number; attributed_plan_edit: boolean; phases_completed: number | null; whole_phases_ticked: number | null }[] = [];
    let previous: Tasks | undefined; let previousPhases: Tasks[] | undefined;
    let initial: Tasks | undefined; let totalChanges = 0;
    for (const s of window.snapshots) {
      if (s.tasks && !initial) initial = s.tasks;
      if (s.tasks && previous) {
        if (s.tasks.total !== previous.total) totalChanges++;
        if (s.tasks.completed !== previous.completed) {
          const delta = s.tasks.completed - previous.completed;
          // Publication corroborates shell writes even if a later part of a compound command fails.
          const cause = calls.filter(c => c.end !== undefined && c.start <= s.at && Math.abs(c.end - s.at) <= 1000 && (isPlanEdit(c) || c.name === "bash" && /agent-work\/plans(?:\/|[\s'";]|$)/.test(String(c.args.command ?? "")))).sort((a,b) => Math.abs(a.end! - s.at) - Math.abs(b.end! - s.at))[0];
          if (cause && !planEdits.some(c => c.id === cause.id)) planEdits.push(cause);
          const comparable = s.phases && previousPhases && s.phases.length === previousPhases.length && s.phases.every((p,i) => p.total === previousPhases![i].total);
          const completedPhases = comparable ? s.phases!.filter((p,i) => p.completed === p.total && previousPhases![i].completed < p.total) : undefined;
          const wholePhases = comparable ? s.phases!.filter((p,i) => p.total > 1 && p.completed === p.total && previousPhases![i].completed === 0) : undefined;
          updates.push({ at: s.at, delta, tasks_ticked: Math.max(0, delta), attributed_plan_edit: cause !== undefined, phases_completed: completedPhases?.length ?? null, whole_phases_ticked: wholePhases?.length ?? null });
        }
      }
      previous = s.tasks;
      previousPhases = s.phases;
    }
    // Trim trailing idle/metadata time, but retain gaps inside the observed Execute episode.
    const work = run.branch.filter(e => e.type === "message" && ["assistant", "toolResult"].includes(e.message?.role) && Date.parse(e.timestamp) >= window.start && Date.parse(e.timestamp) < limit);
    const end = Math.max(window.start, ...work.map(e => Date.parse(e.timestamp)), ...updates.map(u => u.at));
    const intervals = updates.slice(1).map((u, i) => (u.at - updates[i].at) / 1000);
    const tickSizes = updates.map(u => u.tasks_ticked);
    const ticks = tickSizes.reduce((a,b) => a+b, 0);
    const late = updates.filter(u => u.at >= end - (end - window.start) / 10).reduce((n,u) => n + u.tasks_ticked, 0);
    const lags: number[] = []; let since = window.start;
    for (const u of updates) {
      if (u.tasks_ticked) {
        const last = codeEdits.filter(c => c.end! > since && c.end! <= u.at).sort((a,b) => a.end! - b.end!).at(-1);
        if (last) lags.push((u.at - last.end!) / 1000);
      }
      since = u.at;
    }
    const final = window.snapshots.at(-1)?.tasks;
    const complete = final && final.total > 0 ? final.completed === final.total : null;
    return {
      start: window.start, end, duration_s: (end - window.start) / 1000, closed: window.limit !== undefined,
      terminal_response: work.at(-1)?.message?.role === "assistant" && work.at(-1)?.message?.stopReason === "stop",
      initial_tasks: initial ?? null, final_tasks: final ?? null, task_total_changes: totalChanges,
      checkbox_updates: updates.length, updates,
      updates_without_attributed_plan_edit: updates.filter(u => !u.attributed_plan_edit).length,
      update_interval_s: { ...distribution(intervals), max: intervals.length ? Math.max(...intervals) : null },
      tasks_ticked_per_update: distribution(tickSizes), tasks_ticked: ticks, ticks_in_final_tenth: late,
      ticks_in_final_tenth_share: end > window.start ? share(late, ticks) : null,
      all_plan_tasks_checked_at_end: complete,
      // An unchecked task's actual completion cannot be proved from a file edit alone.
      finished_tasks_all_ticked: complete === true ? true : null,
      tool_calls: calls.length, plan_edit_calls: planEdits.length,
      explicit_plan_edit_calls: planEdits.filter(isPlanEdit).length, shell_plan_update_calls: planEdits.filter(c => c.name === "bash").length,
      plan_edit_tool_call_share: share(planEdits.length, calls.length),
      plan_edit_duration_s: distribution(planEdits.filter(c => c.end !== undefined).map(c => (c.end! - c.start) / 1000)),
      last_code_change_to_tick_s: distribution(lags),
      code_changes_after_last_tick: codeEdits.filter(c => c.end! > (updates.at(-1)?.at ?? window.start)).length,
    };
  });
}

export function metrics(run: Replay) {
  const { calls, turns, notes, timeline } = run;
  const lags: number[] = []; let skipped = 0; let incomplete = 0;
  for (let i = 0; i < turns.length; i++) {
    const t = turns[i];
    if (t.end === undefined) { incomplete++; continue; }
    const nextEnd = turns.slice(i + 1).find(t => t.end !== undefined)?.end ?? Infinity;
    const note = notes.find(n => n.at >= t.end! && n.at < nextEnd);
    if (note) lags.push((note.at - t.end) / 1000); else skipped++;
  }
  const ages: number[] = []; let older = 0; const saidAges: number[] = []; let oldNarration = 0;
  for (let i = 0; i < calls.length; i++) {
    const c = calls[i]; const m = shownAt(run, c.start);
    if (m.noteAt !== undefined && (m.shown.done || m.shown.next)) {
      ages.push((c.start - m.noteAt) / 1000);
      if (m.turnStart !== undefined && m.noteAt < m.turnStart) older++;
    }
    if (m.saidAt !== undefined && m.shown.said) {
      saidAges.push((c.start - m.saidAt) / 1000);
      const prev = calls.slice(0, i).filter(previous => previous.end !== undefined && previous.end <= c.start).at(-1);
      if (prev?.end !== undefined && m.saidAt < prev.end) oldNarration++;
    }
  }
  let bounded = 0; let stale = 0; let nextTime = 0; let fallback = 0; let fallbackOld = 0; let unknownTime = 0;
  const dwell: Record<string, { value: string; seconds: number }[]> = { doing: [], next: [], said: [] };
  for (const m of timeline) {
    const dt = (m.until - m.at) / 1000;
    if (!m.known) { unknownTime += dt; continue; }
    bounded += dt;
    if (m.shown.next) {
      nextTime += dt;
      if (m.noteAt !== undefined && m.turnStart !== undefined && m.noteAt < m.turnStart) stale += dt;
    }
    if (m.saidSource === "fallback") {
      fallback += dt;
      if (m.attentionAt !== undefined && m.turnStart !== undefined && m.attentionAt < m.turnStart) fallbackOld += dt;
    }
  }
  // Consecutive intervals with the same visible value form one dwell (hidden breaks it).
  for (const field of ["doing", "next", "said"] as const) {
    let value: string | undefined; let seconds = 0;
    const flush = () => { if (value !== undefined) dwell[field].push({ value, seconds }); };
    for (const m of timeline) {
      const next = m.shown[field];
      if (next !== value) { flush(); value = next; seconds = 0; }
      seconds += (m.until - m.at) / 1000;
    }
    flush();
  }
  // A proxy, not proof of task completion: successful file edits before a plan checkbox update.
  const taskLags: number[] = []; let pendingEdits: number[] = [];
  for (const c of calls) {
    if (c.step !== "execute" || c.error || c.end === undefined || !["edit", "write"].includes(c.name)) continue;
    if (isPlanEdit(c)) {
      const edits = c.args.edits ?? [c.args];
      const ticks = edits.some((e: any) => /\[[xX]\]/.test(e.newText ?? "") && /\[ \]/.test(e.oldText ?? ""));
      if (ticks || (c.name === "write" && /\[[xX]\]/.test(c.args.content ?? ""))) {
        const before = shownAt(run, c.start).raw.doing;
        const advanced = run.timeline.find(m => m.at >= c.start && m.at <= c.end! + 1000 && m.raw.step === "execute" && m.raw.doing !== before);
        if (advanced) {
          taskLags.push(...pendingEdits.map(at => (advanced.at - at) / 1000)); pendingEdits = [];
        }
      }
    } else pendingEdits.push(c.end);
  }
  return {
    session: run.id, tool_calls: calls.length, turns: turns.length,
    turns_without_note: skipped, incomplete_turns: incomplete,
    unknown_tool_intervals: calls.filter(c => c.end === undefined).length, unknown_wall_s: unknownTime,
    bounded_wall_s: bounded, note_lag_s: distribution(lags), note_age_at_action_s: distribution(ages),
    note_older_than_turn_share: share(older, ages.length), note_older_than_turn_count: older,
    stale_turn_share: share(stale, bounded), stale_next_visible_share: share(stale, nextTime), stale_next_s: stale, next_visible_s: nextTime,
    doing_task_lag_s: distribution(taskLags), edits_without_observed_checkbox: pendingEdits.length,
    execute_cadence: executeCadence(run),
    field_dwell_s: dwell, said_narration_age_s: distribution(saidAges),
    said_narration_before_previous_tool_end: oldNarration, said_narration_stale_action_share: share(oldNarration, saidAges.length),
    said_fallback_share: share(fallback, bounded), said_fallback_s: fallback, said_fallback_predates_user_s: fallbackOld,
    said_fallback_predates_user_episodes: timeline.filter((m, i) => m.saidSource === "fallback" && m.attentionAt !== undefined && m.turnStart !== undefined && m.attentionAt < m.turnStart && (i === 0 || timeline[i - 1].saidSource !== "fallback")).length,
  };
}
