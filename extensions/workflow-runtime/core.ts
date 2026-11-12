export type WorkflowStepDefinition = {
	id: string;
	short: string;
	label?: string;
};

import { MAX_ATTENTION, normalizeText, stableRequestId } from "./session-context.ts";

export type WorkflowModeDisplay = {
	id: string;
	short: string;
	label?: string;
	detail?: string;
};

export const FOCUS_MODE_DISPLAY = {
	id: "focus",
	short: "FOC",
	label: "Focus",
} as const satisfies WorkflowModeDisplay;

export const WORKFLOW_DEFINITION = [
	{ id: "plan-md", short: "PL", label: "Plan" },
	{ id: "execute", short: "EX", label: "Execute" },
	{ id: "review", short: "RV", label: "Review" },
	{ id: "reflect", short: "RF", label: "Reflect" },
	{ id: "commit", short: "CM", label: "Commit" },
] as const satisfies readonly WorkflowStepDefinition[];

export type StepName = (typeof WORKFLOW_DEFINITION)[number]["id"];
export type WorkflowSource = "input" | "command" | "shortcut" | "tool";
export type SessionBoundaryReason = "startup" | "reload" | "new" | "resume" | "fork";
export type AgentStopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

export type FocusScope = "execute" | "standalone";

export type FocusExecution = {
	mode: "focus";
	scope: FocusScope;
	runId: string;
	turnsCompleted: number;
};

export type WorkflowActivityDisplay = { id: string; label: string; pass?: number };
export type WorkflowPlanDisplay = {
	phase?: { index: number; count: number; title: string };
	tasks: { completed: number; total: number };
	phases?: Array<{ completed: number; total: number; title?: string }>;
	nextStep?: string;
	current?: { tasks: Array<{ done: boolean; text: string }>; before: number; after: number };
	criteria?: number;
};

export type WorkflowCommitFact = { repo: string; hash: string; subject: string };
export type WorkflowStepFacts = {
	questions?: { answered: number; waiting?: { count: number; text: string; requestId: string } };
	commits?: WorkflowCommitFact[];
	closeout?: { archived?: true; ticketDone?: true };
	pushed?: true;
};

// Agent-reported Review findings and Reflect candidates, kept for the current step run.
export const STEP_ITEM_STATES = ["open", "active", "done", "deferred", "attention"] as const;
export type WorkflowStepItem = { text: string; state: (typeof STEP_ITEM_STATES)[number] };
export const MAX_STEP_ITEMS = 12;
export const MAX_STEP_ITEM_TEXT = 120;
const ITEM_STEPS = ["review", "reflect"] as const;

export const WORKFLOW_ACTIVITIES = {
	"plan-md": [
		{ id: "inspecting-code", label: "Inspecting code", stage: "inspect" },
		{ id: "clarifying-requirements", label: "Clarifying scope", stage: "scope" },
		{ id: "writing-plan", label: "Writing plan", stage: "write" },
		{ id: "reviewing-plan", label: "Reviewing plan", stage: "critic", review: true },
		{ id: "updating-plan", label: "Updating plan", stage: "critic" },
		{ id: "plan-ready", label: "Plan ready", stage: "ready", terminal: true },
	],
	execute: [],
	review: [
		{ id: "reviewing-implementation", label: "Reviewing changes", stage: "review", review: true },
		{ id: "fixing-review-findings", label: "Fixing findings", stage: "fix" },
		{ id: "review-complete", label: "Review complete", stage: "done", terminal: true },
	],
	reflect: [
		{ id: "reviewing-guidance", label: "Reviewing guidance", stage: "review", review: true },
		{ id: "updating-guidance", label: "Updating guidance", stage: "update" },
		{ id: "reflection-complete", label: "Reflection complete", stage: "done", terminal: true },
	],
	commit: [
		{ id: "archiving-plan", label: "Archiving plan", stage: "archive" },
		{ id: "committing-changes", label: "Committing changes", stage: "commit" },
		{ id: "pushing-changes", label: "Pushing changes", stage: "push" },
	],
} as const;

type ActivityDefinition = { id: string; label: string; stage: string; review?: boolean; terminal?: boolean };

const activitiesOf = (step: StepName) => WORKFLOW_ACTIVITIES[step] as readonly ActivityDefinition[];

export type LensState = "done" | "active" | "pending" | "attention" | "skipped";
export type LensStage = { label: string; state: "done" | "active" | "pending" };
export type WorkflowLens = {
	doing?: string;
	stages?: LensStage[];
	progress?: { completed: number; total: number; unit?: string };
	pass?: number;
	summary?: string;
	list?: { label: string; head?: string; items: Array<{ state: LensState; text: string }>; before: number; after: number };
};

// The orchestrator's run as it last published it with set_orchestration; each call replaces it.
export const ORCHESTRATION_STATES = ["queued", "running", "gated", "parked", "committed"] as const;
export const MAX_ORCHESTRATION_TICKETS = 24;
export const MAX_ORCHESTRATION_NOTE = 80;
export const MAX_ORCHESTRATION_GATES = 99;
const MAX_ORCHESTRATION_TEXT = 120;
const MAX_ORCHESTRATION_ID = 80;
export type OrchestrationTicket = {
	id: string;
	state: (typeof ORCHESTRATION_STATES)[number];
	step?: StepName;
	note?: string;
	commit?: string;
	gates?: number;
	// Stable for one parked episode, so a dismissed request cannot hide a later park.
	requestId?: string;
};
export type WorkflowOrchestration = { doing?: string; tickets: OrchestrationTicket[]; pr?: string };

const LENS_STAGES = 12;
const LENS_ITEMS = 12;

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;
const boundedText = (value: string, max = 120) => [...value].slice(0, max).join("");
type LensList = NonNullable<WorkflowLens["list"]>;
type LensItem = LensList["items"][number];

function planList(state: WorkflowState): LensList | undefined {
	const plan = state.plan;
	const questions = state.stepFacts?.questions;
	const passes = state.activityPasses?.["reviewing-plan"] ?? 0;
	const items: LensItem[] = [];
	if (questions?.answered) items.push({ state: "done", text: `${questions.answered} answered` });
	if (questions?.waiting) items.push({ state: "attention", text: boundedText(`${questions.waiting.count} waiting: ${questions.waiting.text}`) });
	if (passes) items.push({ state: state.activity?.id === "reviewing-plan" ? "active" : "done", text: `critic pass ${passes}` });
	// The list needs an item, so a written plan with nothing else to list shows its first critic pass as pending.
	else if (plan && !items.length) items.push({ state: "pending", text: "critic pass 1" });
	if (!items.length) return undefined;
	const head = plan
		? [plan.phase ? plural(plan.phase.count, "phase") : "", plural(plan.tasks.total, "task"), plan.criteria ? `${plan.criteria} ${plan.criteria === 1 ? "criterion" : "criteria"}` : ""].filter(Boolean).join(" · ")
		: undefined;
	return { label: "PLAN", ...(head ? { head } : {}), items, before: 0, after: 0 };
}

const ITEM_LENS_STATE: Record<WorkflowStepItem["state"], LensState> = { open: "pending", active: "active", done: "done", deferred: "skipped", attention: "attention" };
// Each head bucket counts the item states listed with it; Review counts an item that needs the user as open.
const ITEM_HEADS: Record<(typeof ITEM_STEPS)[number], { label: string; buckets: Array<[string, WorkflowStepItem["state"][]]> }> = {
	review: { label: "FOUND", buckets: [["fixed", ["done"]], ["open", ["open", "active", "attention"]], ["deferred", ["deferred"]]] },
	reflect: { label: "CANDS", buckets: [["applied", ["done"]], ["now", ["open", "active"]], ["needs you", ["attention"]], ["no action", ["deferred"]]] },
};

function itemList(state: WorkflowState, step: (typeof ITEM_STEPS)[number]): LensList | undefined {
	const items = state.stepItems;
	if (!items?.length) return undefined;
	const { label, buckets } = ITEM_HEADS[step];
	const head = buckets
		.map(([noun, states]) => [items.filter((item) => states.includes(item.state)).length, noun] as const)
		.filter(([count]) => count)
		.map(([count, noun]) => `${count} ${noun}`)
		.join(" · ");
	return { label, head, items: items.map((item) => ({ state: ITEM_LENS_STATE[item.state], text: item.text })), before: 0, after: 0 };
}

const isItemStep = (step: StepName | undefined): step is (typeof ITEM_STEPS)[number] => (ITEM_STEPS as readonly string[]).includes(step ?? "");

function commitList(state: WorkflowState): LensList | undefined {
	const facts = state.stepFacts;
	const commits = facts?.commits ?? [];
	const items: LensItem[] = [
		...(facts?.closeout?.archived ? [{ state: "done" as const, text: "Plan archived" }] : []),
		...(facts?.closeout?.ticketDone ? [{ state: "done" as const, text: state.ticketId ? `Ticket ${state.ticketId} done` : "Ticket done" }] : []),
		...commits.map((commit) => ({ state: "done" as const, text: boundedText(`${commit.repo} ${commit.hash} ${commit.subject}`) })),
		...(facts?.pushed ? [{ state: state.currentStepComplete ? "done" as const : "active" as const, text: "push" }] : []),
	];
	if (!items.length) return undefined;
	// Keep the latest closeout items; earlier ones are counted.
	const shown = items.slice(-LENS_ITEMS);
	return { label: "CLOSE", ...(commits.length ? { head: plural(commits.length, "commit") } : {}), items: shown, before: items.length - shown.length, after: 0 };
}

const stageState = (index: number, active: number): LensStage["state"] => index < active ? "done" : index === active ? "active" : "pending";

function executeLens(plan: WorkflowPlanDisplay): WorkflowLens {
	const phases = plan.phases ?? [];
	const active = plan.phase ? plan.phase.index - 1 : -1;
	// Keep the current phase visible when a plan has more phases than the stage bound.
	const start = Math.max(0, Math.min(active - 3, phases.length - LENS_STAGES));
	const stages = phases.slice(start, start + LENS_STAGES).map((phase, offset) => {
		const index = start + offset;
		const state: LensStage["state"] = phase.completed === phase.total ? "done" : index === active ? "active" : "pending";
		return { label: String(index + 1), state };
	});
	const window = plan.current;
	const open = window?.tasks.findIndex((task) => !task.done) ?? -1;
	return {
		...(plan.nextStep ? { doing: plan.nextStep } : {}),
		...(stages.length ? { stages } : {}),
		progress: { ...plan.tasks, unit: "tasks" },
		...(window?.tasks.length ? {
			list: {
				label: "PLAN",
				...(plan.phase ? { head: plan.phase.title } : {}),
				items: window.tasks.map((task, index) => ({ state: task.done ? "done" as const : index === open ? "active" as const : "pending" as const, text: task.text })),
				before: window.before,
				after: window.after,
			},
		} : {}),
	};
}

function activityLens(state: WorkflowState, step: StepName): WorkflowLens | undefined {
	if (!state.activity) return undefined;
	const definitions = activitiesOf(step);
	// Push is a Commit stage only once the run reaches it.
	const stages = [...new Set(definitions.map((item) => item.stage))].filter((stage) => stage !== "push" || state.stepFacts?.pushed);
	const current = definitions.find((item) => item.id === state.activity!.id)?.stage;
	const active = state.currentStepComplete ? stages.length : current ? stages.indexOf(current) : -1;
	const list = step === "plan-md" ? planList(state) : step === "commit" ? commitList(state) : isItemStep(step) ? itemList(state, step) : undefined;
	const pass = Math.max(0, ...definitions.filter((item) => item.review).map((item) => state.activityPasses?.[item.id] ?? 0));
	// A completed step names its terminal activity, such as "Review complete", above its final list.
	const activeItem = state.currentStepComplete ? undefined : state.stepItems?.find((item) => item.state === "active");
	return {
		doing: activeItem?.text ?? state.activity.label,
		...(stages.length ? { stages: stages.map((label, index) => ({ label, state: stageState(index, active) })) } : {}),
		...(pass > 1 ? { pass } : {}),
		...(list ? { list } : {}),
	};
}

const TICKET_ID = /^[a-z][a-z0-9-]*-\d{3}$/i;
const SHORT_HASH = /^[0-9a-f]{7,12}$/i;

function boundedField(value: unknown, max: number, name: string): string | undefined {
	if (value === undefined) return undefined;
	const text = normalizeText(value, max + 1);
	if (!text || [...text].length > max) throw new Error(`${name} must be 1–${max} characters.`);
	return text;
}

/** Validates one set_orchestration call; an empty ticket list clears the snapshot. */
export function setOrchestration(
	previous: WorkflowOrchestration | undefined,
	input: { doing?: unknown; tickets: readonly Record<string, unknown>[]; pr?: unknown },
	requestSeed: string,
): WorkflowOrchestration | undefined {
	if (!Array.isArray(input.tickets)) throw new Error("tickets must be a list.");
	if (input.tickets.length > MAX_ORCHESTRATION_TICKETS) throw new Error(`At most ${MAX_ORCHESTRATION_TICKETS} tickets are accepted; got ${input.tickets.length}.`);
	if (!input.tickets.length) return undefined;
	const ids = new Set<string>();
	const tickets = input.tickets.map((raw, index): OrchestrationTicket => {
		const where = `Ticket ${index + 1}`;
		if (typeof raw.id !== "string" || !TICKET_ID.test(raw.id.trim()) || raw.id.trim().length > MAX_ORCHESTRATION_ID) throw new Error(`${where} needs an id like engine-003, at most ${MAX_ORCHESTRATION_ID} characters.`);
		const id = raw.id.trim().toLowerCase();
		if (ids.has(id)) throw new Error(`${where} repeats ${id}.`);
		ids.add(id);
		if (!(ORCHESTRATION_STATES as readonly unknown[]).includes(raw.state)) throw new Error(`${where} state must be one of ${ORCHESTRATION_STATES.join(", ")}.`);
		const state = raw.state as OrchestrationTicket["state"];
		if (raw.step !== undefined && !WORKFLOW_DEFINITION.some((step) => step.id === raw.step)) throw new Error(`${where} step must be a workflow step id.`);
		const given = boundedField(raw.note, MAX_ORCHESTRATION_NOTE, `${where} note`);
		if (raw.commit !== undefined && (typeof raw.commit !== "string" || !SHORT_HASH.test(raw.commit))) throw new Error(`${where} commit must be a short hash.`);
		if (raw.gates !== undefined && (!Number.isInteger(raw.gates) || (raw.gates as number) < 0 || (raw.gates as number) > MAX_ORCHESTRATION_GATES)) throw new Error(`${where} gates must be a whole number from 0 to ${MAX_ORCHESTRATION_GATES}.`);
		const before = previous?.tickets.find((ticket) => ticket.id === id);
		const stillParked = state === "parked" && before?.state === "parked";
		const requestId = state !== "parked" ? undefined : stillParked && before.requestId ? before.requestId : stableRequestId(`${requestSeed}:${id}`);
		// A parked episode keeps its question until the ticket leaves parked, even when a later call omits it.
		const note = given ?? (stillParked ? before.note : undefined);
		return {
			id,
			state,
			...(raw.step !== undefined ? { step: raw.step as StepName } : {}),
			...(note ? { note } : {}),
			...(raw.commit !== undefined ? { commit: (raw.commit as string).toLowerCase() } : {}),
			...(raw.gates !== undefined ? { gates: raw.gates as number } : {}),
			...(requestId ? { requestId } : {}),
		};
	});
	const doing = boundedField(input.doing, MAX_ORCHESTRATION_TEXT, "doing");
	const pr = boundedField(input.pr, MAX_ORCHESTRATION_TEXT, "pr");
	return { ...(doing ? { doing } : {}), tickets, ...(pr ? { pr } : {}) };
}

/** The first parked ticket with a note, as the orchestrator's blocked request. */
export function parkedAttention(orchestration: WorkflowOrchestration | undefined): { requestId: string; kind: "blocked"; text: string } | undefined {
	const parked = orchestration?.tickets.filter((ticket) => ticket.state === "parked" && ticket.note && ticket.requestId) ?? [];
	const first = parked[0];
	if (!first) return undefined;
	const more = parked.length > 1 ? ` (+${parked.length - 1} more)` : "";
	// Long ids and notes are cut so the request stays within the context's attention bound.
	const text = normalizeText(`${first.id} parked · ${first.note}`, MAX_ATTENTION - [...more].length)!.trimEnd();
	return { requestId: first.requestId!, kind: "blocked", text: `${text}${more}` };
}

const ORCHESTRATION_ITEM: Record<OrchestrationTicket["state"], LensState> = { committed: "done", running: "active", gated: "active", parked: "attention", queued: "pending" };
const stepShort = (step: StepName | undefined) => WORKFLOW_DEFINITION.find((item) => item.id === step)?.short;

function ticketItem(ticket: OrchestrationTicket): LensItem {
	const short = stepShort(ticket.step);
	const status = (ticket.state === "running" || ticket.state === "gated") && short ? short : ticket.state;
	return { state: ORCHESTRATION_ITEM[ticket.state], text: [ticket.id, status, ticket.commit].filter(Boolean).join("  ") };
}

function epicLens(orchestration: WorkflowOrchestration): WorkflowLens {
	const tickets = orchestration.tickets;
	const count = (state: OrchestrationTicket["state"]) => tickets.filter((ticket) => ticket.state === state).length;
	// A ticket waiting at a gate is still running for the epic's counts.
	const counts = { running: count("running") + count("gated"), parked: count("parked"), queued: count("queued") };
	const summary = Object.entries(counts).filter(([, value]) => value).map(([state, value]) => `${value} ${state}`).join(" · ");
	// Open tickets fill the window first, then upcoming ones, then the latest commits; the list keeps call order.
	const rank = (ticket: OrchestrationTicket) => ticket.state === "queued" ? 1 : ticket.state === "committed" ? 2 : 0;
	const order = tickets.map((ticket, index) => ({ ticket, index })).sort((a, b) => rank(a.ticket) - rank(b.ticket) || (rank(a.ticket) === 2 ? b.index - a.index : a.index - b.index));
	const shown = new Set(order.slice(0, LENS_ITEMS).map((item) => item.index));
	const hidden = tickets.filter((_ticket, index) => !shown.has(index));
	const before = hidden.filter((ticket) => ticket.state === "committed").length;
	return {
		...(orchestration.doing ? { doing: orchestration.doing } : {}),
		progress: { completed: count("committed"), total: tickets.length, unit: "committed" },
		...(summary ? { summary } : {}),
		list: {
			label: "TIX",
			...(orchestration.pr ? { head: boundedText(`PR ${orchestration.pr}`) } : {}),
			items: tickets.filter((_ticket, index) => shown.has(index)).map(ticketItem),
			before,
			after: hidden.length - before,
		},
	};
}

function ticketLens(orchestration: WorkflowOrchestration, ticket: OrchestrationTicket): WorkflowLens {
	const active = ticket.state === "committed" ? WORKFLOW_DEFINITION.length : WORKFLOW_DEFINITION.findIndex((step) => step.id === ticket.step);
	const summary = [
		ticket.gates !== undefined ? `${plural(ticket.gates, "gate")} ✓` : "",
		ticket.state === "parked" ? "parked" : "",
	].filter(Boolean).join(" · ");
	return {
		...(orchestration.doing ? { doing: orchestration.doing } : {}),
		stages: WORKFLOW_DEFINITION.map((step, index) => ({ label: step.short, state: active < 0 ? "pending" as const : stageState(index, active) })),
		...(summary ? { summary } : {}),
	};
}

/** The orchestration lens wins unless the parent's own step is active and not yet complete. */
export function orchestrationLens(state: WorkflowState): WorkflowLens | undefined {
	const orchestration = state.orchestration;
	if (!orchestration || (state.activeStep && !state.currentStepComplete)) return undefined;
	return orchestration.tickets.length === 1 ? ticketLens(orchestration, orchestration.tickets[0]!) : epicLens(orchestration);
}

export function workflowLens(state: WorkflowState): WorkflowLens | undefined {
	if (!state.activeStep) return undefined;
	// A completed Commit keeps its closeout, and a completed Review or Reflect its item list, as the card's final state.
	const keepsFinal = state.activeStep === "commit" || (isItemStep(state.activeStep) && state.stepItems?.length);
	if (state.currentStepComplete && !keepsFinal) return undefined;
	if (state.activeStep === "execute") return state.plan ? executeLens(state.plan) : undefined;
	return activityLens(state, state.activeStep);
}

export type WorkflowState = {
	activeStep?: StepName;
	ticketId?: string;
	worktreeRecord?: string;
	execution?: FocusExecution;
	activity?: WorkflowActivityDisplay;
	activityPasses?: Record<string, number>;
	plan?: WorkflowPlanDisplay;
	stepFacts?: WorkflowStepFacts;
	stepItems?: WorkflowStepItem[];
	currentStepComplete?: boolean;
	orchestration?: WorkflowOrchestration;
	source?: WorkflowSource;
	updatedAt?: number;
};

export function setWorkflowTicketState(state: WorkflowState, ticketId: string | undefined, source?: WorkflowSource): WorkflowState {
	const { plan: _plan, activity: _activity, activityPasses: _passes, stepFacts: _facts, stepItems: _items, currentStepComplete: _complete, worktreeRecord: _binding, ...withoutStepRun } = state;
	return {
		...(state.ticketId === ticketId ? state : withoutStepRun),
		ticketId,
		...(source ? { source } : {}),
	};
}

export function unlinkWorkflowTicketState(state: WorkflowState, source?: WorkflowSource): WorkflowState {
	const { ticketId: _ticketId, plan: _plan, execution: _execution, stepFacts: _facts, stepItems: _items, ...unlinked } = state;
	return { ...unlinked, ...(source ? { source } : {}) };
}

export function startWorkflowStep(state: WorkflowState, step: StepName, source?: WorkflowSource): WorkflowState {
	const first = WORKFLOW_ACTIVITIES[step][0];
	return {
		...state,
		activeStep: step,
		execution: undefined,
		activity: first ? { id: first.id, label: first.label } : undefined,
		activityPasses: {},
		stepFacts: undefined,
		stepItems: undefined,
		currentStepComplete: undefined,
		...(source ? { source } : {}),
	};
}

function checkStepItems(step: StepName, items: readonly { text: unknown; state: unknown }[]): WorkflowStepItem[] {
	if (!isItemStep(step)) throw new Error(`Activity items are only accepted in review and reflect, not ${step}.`);
	if (items.length > MAX_STEP_ITEMS) throw new Error(`At most ${MAX_STEP_ITEMS} activity items are accepted; got ${items.length}.`);
	return items.map((item, index) => {
		const text = normalizeText(item.text, MAX_STEP_ITEM_TEXT + 1);
		if (!text) throw new Error(`Activity item ${index + 1} needs non-empty text.`);
		if ([...text].length > MAX_STEP_ITEM_TEXT) throw new Error(`Activity item ${index + 1} text exceeds ${MAX_STEP_ITEM_TEXT} characters.`);
		if (!(STEP_ITEM_STATES as readonly unknown[]).includes(item.state)) throw new Error(`Activity item ${index + 1} state must be one of ${STEP_ITEM_STATES.join(", ")}.`);
		return { text, state: item.state as WorkflowStepItem["state"] };
	});
}

// Items replace the step's list; a call without items keeps the last list.
export function setWorkflowActivity(state: WorkflowState, activityId: string, items?: readonly { text: unknown; state: unknown }[]): WorkflowState {
	if (!state.activeStep) throw new Error("No active workflow step.");
	const definition = activitiesOf(state.activeStep).find((item) => item.id === activityId);
	if (!definition) {
		const owner = WORKFLOW_DEFINITION.find((step) => (WORKFLOW_ACTIVITIES[step.id] as readonly { id: string }[]).some((activity) => activity.id === activityId));
		throw new Error(`Activity ${activityId} does not belong to ${state.activeStep}.${owner ? ` Call set_workflow_step with stepId "${owner.id}" first, only if the user authorized that step.` : ""}`);
	}
	const stepItems = items ? checkStepItems(state.activeStep, items) : undefined;
	const passes = { ...(state.activityPasses ?? {}) };
	// Terminal publishes are counted too, so a ready hand-back can restore a done label this step run reached.
	if (definition.review || definition.terminal) passes[activityId] = (passes[activityId] ?? 0) + 1;
	const pass = definition.review ? (passes[activityId] ?? 1) : undefined;
	return {
		...state,
		...(activityId === "pushing-changes" ? { stepFacts: { ...state.stepFacts, pushed: true as const } } : {}),
		...(stepItems ? { stepItems } : {}),
		activityPasses: passes,
		activity: { id: definition.id, label: definition.label, ...(pass && pass > 1 ? { pass } : {}) },
		currentStepComplete: definition.terminal ? true : undefined,
	};
}

export function restoreReachedDone(state: WorkflowState): WorkflowState {
	if (!state.activeStep || state.currentStepComplete) return state;
	const done = (WORKFLOW_ACTIVITIES[state.activeStep] as readonly { id: string; terminal?: boolean }[]).find((item) => item.terminal);
	return done && state.activityPasses?.[done.id] ? setWorkflowActivity(state, done.id) : state;
}

export type WorkflowRuntimeEntryData = Omit<WorkflowState, "plan"> & {
	plan?: Omit<WorkflowPlanDisplay, "current" | "criteria">;
	// The parent's step while the orchestration lens is published without a rail position.
	heldStep?: StepName;
	steps: WorkflowStepDefinition[];
	activeMode?: WorkflowModeDisplay;
	lens?: WorkflowLens;
};

type RestoredWorkflowState = WorkflowState & {
	steps?: unknown;
};

export function withWorkflowDefinition(state: WorkflowState): WorkflowRuntimeEntryData {
	const activeMode = state.execution?.mode === "focus"
		? { ...FOCUS_MODE_DISPLAY, detail: `turn ${state.execution.turnsCompleted}` }
		: undefined;
	const orchestrated = orchestrationLens(state);
	const lens = orchestrated ?? workflowLens(state);
	// The task window and criteria count feed only the lens; the published plan keeps counts and phases.
	const { current: _current, criteria: _criteria, ...plan } = state.plan ?? {};
	// Hub shows an orchestration lens without a rail, so the parent's step moves out of activeStep.
	const { activeStep, ...unpositioned } = state;
	return {
		...(orchestrated && activeStep ? { ...unpositioned, heldStep: activeStep } : state),
		...(state.plan ? { plan: plan as Omit<WorkflowPlanDisplay, "current" | "criteria"> } : {}),
		steps: WORKFLOW_DEFINITION.map((step) => ({ ...step })),
		...(activeMode ? { activeMode } : {}),
		...(lens ? { lens } : {}),
	};
}

function hasCurrentWorkflowDefinition(steps: unknown): boolean {
	if (!Array.isArray(steps) || steps.length !== WORKFLOW_DEFINITION.length) return false;
	return WORKFLOW_DEFINITION.every((expected, index) => {
		const actual = steps[index];
		return (
			typeof actual === "object" &&
			actual !== null &&
			"id" in actual &&
			actual.id === expected.id &&
			"short" in actual &&
			actual.short === expected.short &&
			"label" in actual &&
			actual.label === expected.label
		);
	});
}

export function shouldNormalizeWorkflowDefinition(
	state: RestoredWorkflowState,
	reason: SessionBoundaryReason,
): boolean {
	if (reason === "new" || reason === "fork" || !state.activeStep) return false;
	return !hasCurrentWorkflowDefinition(state.steps);
}

export type StopReason = "session-boundary";

export type RuntimeEffect =
	| { kind: "continue"; runId: string }
	| { kind: "notify-stop"; reason: StopReason };

export type RuntimeEvent =
	| { type: "activate-focus"; scope: FocusScope; ticketId?: string; runId: string }
	| { type: "agent-end"; stopReason?: AgentStopReason }
	| { type: "end-focus" }
	| { type: "ordinary-input" }
	| { type: "session-compact"; reason: "manual" | "threshold" | "overflow" }
	| { type: "session-boundary"; reason: SessionBoundaryReason };

export type TransitionResult = {
	state: WorkflowState;
	effects: RuntimeEffect[];
};

function withoutExecution(state: WorkflowState): WorkflowState {
	const { execution: _execution, updatedAt: _updatedAt, source: _source, ...rest } = state;
	return rest;
}

export function finalAssistantStopReason(
	messages: readonly { role: string; stopReason?: string }[],
): AgentStopReason | undefined {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (message?.role !== "assistant") continue;
		switch (message.stopReason) {
			case "stop":
			case "length":
			case "toolUse":
			case "error":
			case "aborted":
				return message.stopReason;
			default:
				return undefined;
		}
	}
	return undefined;
}

export type FocusRecoveryEvent =
	| { type: "ordinary-input"; streaming: boolean }
	| { type: "session-compact"; willRetry: boolean }
	| { type: "before-agent-start" };

export type FocusRecoveryResult = {
	pending: boolean;
	delivery?: "before-agent-start" | "steer";
};

export function recoverFocus(pending: boolean, event: FocusRecoveryEvent): FocusRecoveryResult {
	if (event.type === "ordinary-input") return { pending: event.streaming ? pending : true };
	if (event.type === "session-compact") {
		return event.willRetry ? { pending: false, delivery: "steer" } : { pending };
	}
	return pending ? { pending: false, delivery: "before-agent-start" } : { pending: false };
}

export function completeWorkflow(state: WorkflowState): WorkflowState {
	if (state.activeStep !== "commit") throw new Error("Workflow can only be completed during commit.");
	return {
		...state,
		currentStepComplete: true,
		activity: { id: "commit-complete", label: "Commit complete" },
	};
}

export function positionalMarker(index: number, activeIndex: number, currentStepComplete = false): "✓" | "◉" | "·" {
	if (index < activeIndex || (index === activeIndex && currentStepComplete)) return "✓";
	return index === activeIndex ? "◉" : "·";
}

export function focusScope(state: WorkflowState): FocusScope | undefined {
	if (!state.activeStep) return "standalone";
	return state.activeStep === "execute" ? "execute" : undefined;
}

export function continuationContent(state: WorkflowState): string {
	if (!state.execution) return "";
	const start = state.execution.scope === "execute"
		? "Continue Execute within the active plan. Re-read it after compaction or whenever details are unclear; follow its verification gates.\n"
		: "Continue the approved task. ";
	return `${start}Prefer removal and simplification; reuse before adding.
Verify actual results. Keep working while safe, in-scope work remains.
Call end_focus when complete and verified, or blocked; include a brief summary.`;
}

export function transition(state: WorkflowState, event: RuntimeEvent): TransitionResult {
	if (event.type === "activate-focus") {
		const ticketId = event.ticketId ?? state.ticketId;
		return {
			state: {
				...(event.scope === "execute" ? { activeStep: "execute" as const } : {}),
				...(ticketId ? { ticketId } : {}),
				...(state.orchestration ? { orchestration: state.orchestration } : {}),
				execution: {
					mode: "focus",
					scope: event.scope,
					runId: event.runId,
					turnsCompleted: 0,
				},
			},
			effects: [],
		};
	}

	if (event.type === "session-compact") return { state, effects: [] };

	if (event.type === "session-boundary") {
		const resetsWorkflow = event.reason === "new" || event.reason === "fork";
		if (!state.execution) return { state: resetsWorkflow ? {} : state, effects: [] };
		return {
			state: resetsWorkflow ? {} : withoutExecution(state),
			effects: [{ kind: "notify-stop", reason: "session-boundary" }],
		};
	}

	if (!state.execution) return { state, effects: [] };

	if (event.type === "end-focus") return { state: withoutExecution(state), effects: [] };

	if (event.type === "ordinary-input") return { state, effects: [] };

	if (event.stopReason !== "stop") return { state, effects: [] };

	return {
		state: {
			...state,
			execution: {
				...state.execution,
				turnsCompleted: state.execution.turnsCompleted + 1,
			},
		},
		effects: [{ kind: "continue", runId: state.execution.runId }],
	};
}

export function createContinuationQueue(schedule: (task: () => void) => void = queueMicrotask) {
	let queuedRunId: string | undefined;

	return {
		enqueue(runId: string, activeRunId: () => string | undefined, deliver: () => void): boolean {
			if (queuedRunId) return false;
			queuedRunId = runId;
			schedule(() => {
				queuedRunId = undefined;
				if (activeRunId() === runId) deliver();
			});
			return true;
		},
	};
}
