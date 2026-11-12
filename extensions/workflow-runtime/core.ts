export type WorkflowStepDefinition = {
	id: string;
	short: string;
	label?: string;
};

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
};

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
	list?: { label: string; head?: string; items: Array<{ state: LensState; text: string }>; before: number; after: number };
};

const LENS_STAGES = 12;

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
	const stages = [...new Set(definitions.map((item) => item.stage))];
	const current = definitions.find((item) => item.id === state.activity!.id)?.stage;
	const active = current ? stages.indexOf(current) : -1;
	const pass = Math.max(0, ...definitions.filter((item) => item.review).map((item) => state.activityPasses?.[item.id] ?? 0));
	return {
		doing: state.activity.label,
		...(stages.length ? { stages: stages.map((label, index) => ({ label, state: stageState(index, active) })) } : {}),
		...(pass > 1 ? { pass } : {}),
	};
}

export function workflowLens(state: WorkflowState): WorkflowLens | undefined {
	if (!state.activeStep || state.currentStepComplete) return undefined;
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
	currentStepComplete?: boolean;
	source?: WorkflowSource;
	updatedAt?: number;
};

export function setWorkflowTicketState(state: WorkflowState, ticketId: string | undefined, source?: WorkflowSource): WorkflowState {
	const { plan: _plan, activity: _activity, activityPasses: _passes, currentStepComplete: _complete, worktreeRecord: _binding, ...withoutStepRun } = state;
	return {
		...(state.ticketId === ticketId ? state : withoutStepRun),
		ticketId,
		...(source ? { source } : {}),
	};
}

export function unlinkWorkflowTicketState(state: WorkflowState, source?: WorkflowSource): WorkflowState {
	const { ticketId: _ticketId, plan: _plan, execution: _execution, ...unlinked } = state;
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
		currentStepComplete: undefined,
		...(source ? { source } : {}),
	};
}

export function setWorkflowActivity(state: WorkflowState, activityId: string): WorkflowState {
	if (!state.activeStep) throw new Error("No active workflow step.");
	const definition = activitiesOf(state.activeStep).find((item) => item.id === activityId);
	if (!definition) {
		const owner = WORKFLOW_DEFINITION.find((step) => (WORKFLOW_ACTIVITIES[step.id] as readonly { id: string }[]).some((activity) => activity.id === activityId));
		throw new Error(`Activity ${activityId} does not belong to ${state.activeStep}.${owner ? ` Call set_workflow_step with stepId "${owner.id}" first, only if the user authorized that step.` : ""}`);
	}
	const passes = { ...(state.activityPasses ?? {}) };
	// Terminal publishes are counted too, so a ready hand-back can restore a done label this step run reached.
	if (definition.review || definition.terminal) passes[activityId] = (passes[activityId] ?? 0) + 1;
	const pass = definition.review ? (passes[activityId] ?? 1) : undefined;
	return {
		...state,
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
	plan?: Omit<WorkflowPlanDisplay, "current">;
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
	const lens = workflowLens(state);
	// The task window feeds only the lens; the published plan keeps counts and phases.
	const { current: _current, ...plan } = state.plan ?? {};
	return {
		...state,
		...(state.plan ? { plan: plan as Omit<WorkflowPlanDisplay, "current"> } : {}),
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
