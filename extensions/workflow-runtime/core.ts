export const WORKFLOW_STEPS = ["plan-md", "execute", "review", "reflect", "commit"] as const;
export type StepName = (typeof WORKFLOW_STEPS)[number];
export type WorkflowSource = "input" | "command" | "shortcut" | "tool";
export type AgentStopReason = "stop" | "length" | "toolUse" | "error" | "aborted";

export type FocusExecution = {
	mode: "focus";
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
	| { type: "session-boundary"; reason: "startup" | "reload" | "new" | "resume" | "fork" };

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
