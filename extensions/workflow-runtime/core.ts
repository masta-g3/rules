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

export type WorkflowState = {
	activeStep?: StepName;
	ticketId?: string;
	execution?: FocusExecution;
	source?: WorkflowSource;
	updatedAt?: number;
};

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

export function completeWorkflow(state: WorkflowState, clearState: () => WorkflowState): WorkflowState {
	if (state.activeStep !== "commit") throw new Error("Workflow can only be completed during commit.");
	return clearState();
}

export function focusScope(state: WorkflowState): FocusScope | undefined {
	if (!state.activeStep) return "standalone";
	return state.activeStep === "execute" ? "execute" : undefined;
}

export function continuationContent(state: WorkflowState): string {
	if (!state.execution) return "";
	const start = state.execution.scope === "execute"
		? state.ticketId
			? `Continue the active focus run for ticket ${state.ticketId}.\nFollow Execute and the active plan.`
			: "Continue the active Execute focus run.\nFollow Execute and the active plan."
		: "Continue the active standalone focus run.\nFollow the user's task and project instructions.";
	return `${start}
Focus itself does not start or advance workflow steps. Start or advance one only when the user explicitly requests it.
Verify progress against the actual result, then take the next concrete work or verification step.
Exit focus explicitly: call \`end_focus\` with outcome \`completed\` when the requested outcome is complete and verified, or \`blocked\` when further progress requires user input or an external dependency; include a concise summary in either case. Do not stop at a progress report or leave focus active after either condition.`;
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
