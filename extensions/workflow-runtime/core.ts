export const WORKFLOW_STEPS = ["plan-md", "execute", "review", "reflect", "commit"] as const;
export type StepName = (typeof WORKFLOW_STEPS)[number];
export type WorkflowSource = "input" | "command" | "shortcut" | "tool";

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
	| { type: "agent-end" }
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

export function focusContract(state: WorkflowState): string {
	const execution = state.execution;
	if (!execution) return "";
	const ticket = state.ticketId ? ` for ticket ${state.ticketId}` : "";
	return `Focus mode is active${ticket}; ${execution.turnsCompleted} turns are complete and there is no turn limit. Continue working autonomously instead of stopping at a progress report. Follow \`$SKILLS_ROOT/execute/SKILL.md\`, re-read the active plan document if one exists, and verify its checklist against the repository. If there is no plan, continue the feature or task the user provided. When the work is implemented and verified, or when further progress requires user input, call \`end_focus\` with outcome \`completed\` or \`blocked\` and a concise summary. Ordinary user input does not end focus mode. Only \`end_focus\`, changing workflow steps, or a session boundary ends it.`;
}

export function continuationContent(state: WorkflowState): string {
	const execution = state.execution;
	if (!execution) return "";
	const ticket = state.ticketId ? `\nActive ticket: ${state.ticketId}` : "";
	return `Continue focus mode on the same work.${ticket}
Turns completed: ${execution.turnsCompleted}

Re-read \`$SKILLS_ROOT/execute/SKILL.md\` and the active plan document if one exists. Verify the plan checklist against the repository, then take the next concrete implementation or verification step. If no plan exists, continue from the feature or task the user provided. Do not stop merely to report progress.

When all requested work is implemented and verified, call \`end_focus\` with outcome \`completed\` and a concise summary. If progress is blocked on user input or an external requirement, call \`end_focus\` with outcome \`blocked\` and explain the blocker. If work remains, keep working; focus mode will continue automatically.`;
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
