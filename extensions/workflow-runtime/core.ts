export const CONTINUE_LABEL = "LONG EXECUTE CONTINUE";
export const DEFAULT_MAX_TURNS = 6;

export const WORKFLOW_STEPS = ["next-feature", "plan-md", "execute", "review", "reflect", "commit"] as const;
export type StepName = (typeof WORKFLOW_STEPS)[number];
export type WorkflowSource = "input" | "command" | "shortcut" | "tool";

export type LongExecution = {
	mode: "long";
	runId: string;
	turnsCompleted: number;
	maxTurns: number;
};

export type WorkflowState = {
	activeStep?: StepName;
	ticketId?: string;
	execution?: LongExecution;
	source?: WorkflowSource;
	updatedAt?: number;
};

export type StopReason = "ready" | "blocked" | "missing-marker" | "limit" | "user-interruption" | "session-boundary";

export type RuntimeEffect =
	| { kind: "continue"; runId: string }
	| { kind: "notify-stop"; reason: StopReason };

export type RuntimeEvent =
	| { type: "activate-long"; ticketId?: string; runId: string }
	| { type: "agent-end"; finalAssistantLines: string[] }
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

function isStopLabel(line: string): boolean {
	return line === "READY FOR REVIEW" || line === "NEEDS USER" || line === "PENDING STEPS" || line.startsWith("BLOCKED");
}

function stopReason(lines: string[]): StopReason | undefined {
	if (lines.includes("READY FOR REVIEW")) return "ready";
	return lines.some(isStopLabel) ? "blocked" : undefined;
}

export function transition(state: WorkflowState, event: RuntimeEvent): TransitionResult {
	if (event.type === "activate-long") {
		return {
			state: {
				activeStep: "execute",
				ticketId: event.ticketId ?? state.ticketId,
				execution: {
					mode: "long",
					runId: event.runId,
					turnsCompleted: 0,
					maxTurns: DEFAULT_MAX_TURNS,
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

	if (event.type === "ordinary-input") {
		return {
			state: withoutExecution(state),
			effects: [{ kind: "notify-stop", reason: "user-interruption" }],
		};
	}

	const reason = stopReason(event.finalAssistantLines);
	if (reason) {
		return { state: withoutExecution(state), effects: [{ kind: "notify-stop", reason }] };
	}

	if (event.finalAssistantLines.at(-1) !== CONTINUE_LABEL) {
		return {
			state: withoutExecution(state),
			effects: [{ kind: "notify-stop", reason: "missing-marker" }],
		};
	}

	const turnsCompleted = state.execution.turnsCompleted + 1;
	if (turnsCompleted >= state.execution.maxTurns) {
		return {
			state: withoutExecution(state),
			effects: [{ kind: "notify-stop", reason: "limit" }],
		};
	}

	return {
		state: {
			...state,
			execution: { ...state.execution, turnsCompleted },
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
