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

export type FocusExecution = {
	mode: "focus";
	runId: string;
	turnsCompleted: number;
};

export type WorkflowActivityDisplay = { id: string; label: string; pass?: number };
export type WorkflowPlanDisplay = {
	phase?: { index: number; count: number; title: string };
	tasks: { completed: number; total: number };
	phases?: Array<{ completed: number; total: number }>;
	nextStep?: string;
};

export const WORKFLOW_ACTIVITIES = {
	"plan-md": [
		{ id: "inspecting-code", label: "Inspecting code" },
		{ id: "clarifying-requirements", label: "Clarifying scope" },
		{ id: "writing-plan", label: "Writing plan" },
		{ id: "reviewing-plan", label: "Reviewing plan", review: true },
		{ id: "updating-plan", label: "Updating plan" },
		{ id: "plan-ready", label: "Plan ready", terminal: true },
	],
	execute: [],
	review: [
		{ id: "reviewing-implementation", label: "Reviewing changes", review: true },
		{ id: "fixing-review-findings", label: "Fixing findings" },
		{ id: "review-complete", label: "Review complete", terminal: true },
	],
	reflect: [
		{ id: "reviewing-guidance", label: "Reviewing guidance", review: true },
		{ id: "updating-guidance", label: "Updating guidance" },
		{ id: "reflection-complete", label: "Reflection complete", terminal: true },
	],
	commit: [
		{ id: "archiving-plan", label: "Archiving plan" },
		{ id: "committing-changes", label: "Committing changes" },
	],
} as const;

export type WorkflowState = {
	activeStep?: StepName;
	ticketId?: string;
	execution?: FocusExecution;
	activity?: WorkflowActivityDisplay;
	activityPasses?: Record<string, number>;
	plan?: WorkflowPlanDisplay;
	currentStepComplete?: boolean;
	source?: WorkflowSource;
	updatedAt?: number;
};

export function setWorkflowTicketState(state: WorkflowState, ticketId: string | undefined, source?: WorkflowSource): WorkflowState {
	const { plan: _plan, activity: _activity, activityPasses: _passes, currentStepComplete: _complete, ...withoutStepRun } = state;
	return {
		...(state.ticketId === ticketId ? state : withoutStepRun),
		ticketId,
		...(source ? { source } : {}),
	};
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
	const definition = (WORKFLOW_ACTIVITIES[state.activeStep] as readonly { id: string; label: string; review?: boolean; terminal?: boolean }[]).find((item) => item.id === activityId);
	if (!definition) throw new Error(`Activity ${activityId} does not belong to ${state.activeStep}.`);
	const passes = { ...(state.activityPasses ?? {}) };
	if (definition.review) passes[activityId] = (passes[activityId] ?? 0) + 1;
	const pass = definition.review ? (passes[activityId] ?? 1) : undefined;
	return {
		...state,
		activityPasses: passes,
		activity: { id: definition.id, label: definition.label, ...(pass && pass > 1 ? { pass } : {}) },
		currentStepComplete: definition.terminal ? true : undefined,
	};
}

export type WorkflowRuntimeEntryData = WorkflowState & {
	steps: WorkflowStepDefinition[];
	activeMode?: WorkflowModeDisplay;
};

type RestoredWorkflowState = WorkflowState & {
	steps?: unknown;
};

export function withWorkflowDefinition(state: WorkflowState): WorkflowRuntimeEntryData {
	const activeMode = state.execution?.mode === "focus"
		? { ...FOCUS_MODE_DISPLAY, detail: `turn ${state.execution.turnsCompleted}` }
		: undefined;
	return {
		...state,
		steps: WORKFLOW_DEFINITION.map((step) => ({ ...step })),
		...(activeMode ? { activeMode } : {}),
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
	| { type: "activate-focus"; ticketId?: string; runId: string }
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

export function continuationContent(state: WorkflowState): string {
	if (!state.execution) return "";
	const ticket = state.ticketId ? `Continue the active focus run for ticket ${state.ticketId}.\n` : "";
	return `${ticket}Follow \`execute\` and the active plan when present; otherwise continue the user's task. Verify progress against the repository, then take the next concrete implementation or verification step.
Exit focus explicitly: call \`end_focus\` with outcome \`completed\` when the work is implemented and verified, or \`blocked\` when further progress requires user input or an external dependency; include a concise summary in either case. Do not stop at a progress report or leave focus active after either condition.`;
}

export function transition(state: WorkflowState, event: RuntimeEvent): TransitionResult {
	if (event.type === "activate-focus") {
		return {
			state: {
				activeStep: "execute",
				ticketId: event.ticketId ?? state.ticketId,
				execution: {
					mode: "focus",
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
