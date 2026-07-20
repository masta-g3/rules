import { keyHint, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { Box, Spacer, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
	continuationContent,
	createContinuationQueue,
	focusContract,
	transition,
	WORKFLOW_STEPS,
	type RuntimeEffect,
	type StepName,
	type WorkflowState,
} from "./core.ts";

const ENTRY_TYPE = "workflow-runtime";
const EVENT_TYPE = "workflow-runtime-event";
const SKILL_PREFIX = /^\/skill:([a-z0-9-]+)(?:\s|$)/;
const FOCUS_SKILL = "focus";
const TICKET_PATTERN = /\b([a-z][a-z0-9-]*-\d{3})\b/i;
const TICKET_ARG_PATTERN = /^([a-z][a-z0-9-]*-\d{3})$/i;
const FOCUS_PULSE_MS = 700;
const ADVANCE_SHORTCUT = "ctrl+shift+right";
const ADVANCE_DOUBLE_PRESS_MS = 800;

const TOKENS = {
	muted: "dim",
	rail: "borderMuted",
	activeFg: "accent",
	activeBg: "selectedBg",
	ticket: "dim",
} as const;

const STEP_SHORT: Record<StepName, string> = {
	prime: "PR",
	"plan-md": "PL",
	execute: "EX",
	review: "RV",
	reflect: "RF",
	commit: "CM",
};

const WORKFLOW = WORKFLOW_STEPS.map((id) => ({ id, short: STEP_SHORT[id] }));

const STOP_NOTICES: Record<Exclude<RuntimeEffect, { kind: "continue" }>["reason"], string> = {
	"user-interruption": "Manual input ended focus mode.",
	"session-boundary": "Focus mode stopped at a session boundary. Reinvoke /skill:focus to continue.",
};

type CustomEntry = {
	type: string;
	customType?: string;
	data?: WorkflowState;
};

type RuntimeEventDetails = {
	kind: "continuation";
	state: WorkflowState;
};

let activeTui: TUI | undefined;
let focusPulseOn = true;
let focusPulseTimer: ReturnType<typeof setInterval> | undefined;

function syncFocusPulse(active: boolean): void {
	if (!active) {
		if (focusPulseTimer) clearInterval(focusPulseTimer);
		focusPulseTimer = undefined;
		focusPulseOn = true;
		return;
	}

	if (focusPulseTimer) return;
	focusPulseTimer = setInterval(() => {
		focusPulseOn = !focusPulseOn;
		activeTui?.requestRender();
	}, FOCUS_PULSE_MS);
}

function isStepName(value: string): value is StepName {
	return WORKFLOW.some((step) => step.id === value);
}

function getStep(stepName?: StepName) {
	return WORKFLOW.find((step) => step.id === stepName);
}

function getStepIndex(stepName: StepName): number {
	return WORKFLOW.findIndex((step) => step.id === stepName);
}

function getNextStep(stepName: StepName): StepName | undefined {
	const index = getStepIndex(stepName);
	return WORKFLOW[index + 1]?.id;
}

function buildSkillCommand(stepName: StepName, ticketId?: string): string {
	return ticketId ? `/skill:${stepName} ${ticketId}` : `/skill:${stepName}`;
}

function extractSkill(text: string): string | undefined {
	return text.match(SKILL_PREFIX)?.[1];
}

function extractStep(text: string): StepName | undefined {
	const stepName = extractSkill(text);
	return stepName && isStepName(stepName) ? stepName : undefined;
}

function extractSkillTicket(text: string): string | undefined {
	const skillCall = text.match(/^\/skill:[a-z0-9-]+\s+([^\s]+)/i)?.[1];
	return skillCall && TICKET_ARG_PATTERN.test(skillCall) ? skillCall.toLowerCase() : undefined;
}

function parseTicketArg(text: string): string | undefined {
	return text.trim().match(TICKET_ARG_PATTERN)?.[1]?.toLowerCase();
}

function ticketIdFrom(text: string): string | undefined {
	return text.match(TICKET_PATTERN)?.[1]?.toLowerCase();
}

function newRunId(): string {
	return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function findLatestState(entries: unknown[]): WorkflowState {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i] as CustomEntry;
		if (entry?.type === "custom" && entry.customType === ENTRY_TYPE && entry.data) return entry.data;
	}
	return {};
}

function persistState(pi: ExtensionAPI, state: WorkflowState): void {
	pi.appendEntry(ENTRY_TYPE, state);
}

function setState(pi: ExtensionAPI, ctx: ExtensionContext, nextState: WorkflowState): WorkflowState {
	const state = { ...nextState, updatedAt: Date.now() };
	persistState(pi, state);
	applyWidget(ctx, state);
	return state;
}

function clearState(pi: ExtensionAPI, ctx: ExtensionContext): WorkflowState {
	return setState(pi, ctx, {});
}

function renderTicket(theme: ExtensionContext["ui"]["theme"], ticketId?: string): string {
	return ticketId ? `${theme.fg(TOKENS.rail, " · ")}${theme.fg(TOKENS.ticket, ticketId)}` : "";
}

function renderStepShort(step: (typeof WORKFLOW)[number], state: WorkflowState): string {
	if (step.id === "execute" && state.execution?.mode === "focus") return focusPulseOn ? "FOC ✦" : "FOC ✧";
	return step.short;
}

function renderRail(state: WorkflowState, theme: ExtensionContext["ui"]["theme"]): { full: string; compact: string } {
	const activeStep = getStep(state.activeStep);
	if (!activeStep) return { full: "", compact: "" };

	const separator = theme.fg(TOKENS.rail, " ─ ");
	const full = WORKFLOW.map((step) => {
		const short = renderStepShort(step, state);
		return step.id === activeStep.id
			? theme.bg(TOKENS.activeBg, theme.fg(TOKENS.activeFg, short))
			: theme.fg(TOKENS.muted, short);
	}).join(separator);

	const compact = `${theme.fg(TOKENS.muted, `${getStepIndex(activeStep.id) + 1}/${WORKFLOW.length} `)}${theme.bg(
		TOKENS.activeBg,
		theme.fg(TOKENS.activeFg, renderStepShort(activeStep, state)),
	)}`;
	return { full, compact };
}

function renderIndicator(width: number, state: WorkflowState, theme: ExtensionContext["ui"]["theme"]): string {
	const rail = renderRail(state, theme);
	if (!rail.full) return "";

	const ticket = renderTicket(theme, state.ticketId);
	const full = `${rail.full}${ticket}`;
	if (visibleWidth(full) <= width) return full;

	const compact = `${rail.compact}${ticket}`;
	if (visibleWidth(compact) <= width) return compact;

	if (ticket) {
		const compactTicket = truncateToWidth(ticket, Math.max(0, width - visibleWidth(rail.compact)));
		const compactWithTicket = `${rail.compact}${compactTicket}`;
		if (visibleWidth(compactWithTicket) <= width) return compactWithTicket;
	}

	return truncateToWidth(rail.compact, width);
}

function applyWidget(ctx: ExtensionContext, state: WorkflowState): void {
	syncFocusPulse(state.execution?.mode === "focus");
	if (!state.activeStep) {
		ctx.ui.setWidget(ENTRY_TYPE, undefined);
		return;
	}

	ctx.ui.setWidget(ENTRY_TYPE, (tui, theme) => {
		activeTui = tui;
		return {
			render(width: number): string[] {
				const line = renderIndicator(width, state, theme);
				return line ? [line] : [];
			},
			invalidate(): void {},
		};
	});
}

function emitContinuation(pi: ExtensionAPI, state: WorkflowState): void {
	pi.sendMessage(
		{
			customType: EVENT_TYPE,
			content: continuationContent(state),
			display: true,
			details: { kind: "continuation", state } satisfies RuntimeEventDetails,
		},
		{ triggerTurn: true, deliverAs: "followUp" },
	);
}

function applyEffects(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	getState: () => WorkflowState,
	effects: RuntimeEffect[],
	queue: ReturnType<typeof createContinuationQueue>,
): void {
	for (const effect of effects) {
		if (effect.kind === "notify-stop") {
			ctx.ui.notify(STOP_NOTICES[effect.reason], "info");
			continue;
		}
		queue.enqueue(
			effect.runId,
			() => getState().execution?.runId,
			() => emitContinuation(pi, getState()),
		);
	}
}

export default function workflowRuntime(pi: ExtensionAPI): void {
	let state: WorkflowState = {};
	let lastAdvanceShortcutAt = 0;
	const continuationQueue = createContinuationQueue();

	pi.registerMessageRenderer(EVENT_TYPE, (message, { expanded }, theme) => {
		const details = message.details as RuntimeEventDetails | undefined;
		const eventState = details?.state;
		const execution = eventState?.execution;
		const progress = execution ? ` · next turn ${execution.turnsCompleted + 1}` : "";
		if (!expanded) {
			return new Text(
				`${theme.fg("customMessageLabel", theme.bold("Workflow"))}${theme.fg("dim", " · ")}${theme.fg("customMessageText", `Focus continuing${progress}`)} ${theme.fg("dim", `(${keyHint("app.tools.expand", "to expand")})`)}`,
				0,
				0,
			);
		}

		const box = new Box(1, 1, (value) => theme.bg("customMessageBg", value));
		box.addChild(new Text(theme.fg("customMessageLabel", theme.bold("Workflow")), 0, 0));
		box.addChild(new Spacer(1));
		const ticket = eventState?.ticketId ? `Ticket: ${eventState.ticketId}\n` : "";
		box.addChild(new Text(theme.fg("customMessageText", `${ticket}${String(message.content)}`), 0, 0));
		return box;
	});

	pi.registerCommand("wf-ticket", {
		description: "Set or override the active workflow ticket",
		handler: async (args, ctx) => {
			const ticketId = parseTicketArg(args ?? "");
			if (!ticketId) {
				ctx.ui.notify("Usage: /wf-ticket <ticket-id>", "warning");
				return;
			}
			state = setState(pi, ctx, { ...state, ticketId, source: "command" });
			ctx.ui.notify(`Workflow ticket set to ${ticketId}.`, "info");
		},
	});

	pi.registerCommand("wf-clear", {
		description: "Clear the workflow indicator",
		handler: async (_args, ctx) => {
			state = clearState(pi, ctx);
			ctx.ui.notify("Workflow indicator cleared.", "info");
		},
	});

	pi.registerTool({
		name: "set_workflow_ticket",
		label: "Set Workflow Ticket",
		description: "Set the active workflow ticket shown in the Pi workflow rail.",
		promptSnippet: "Set the active workflow ticket for the current workflow session",
		promptGuidelines: [
			"Use set_workflow_ticket when the user asks to switch the active workflow ticket or the current ticket is explicitly identified.",
		],
		parameters: Type.Object({
			ticketId: Type.String({ description: "Ticket id like engine-003" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const ticketId = parseTicketArg(params.ticketId);
			if (!ticketId) throw new Error("Invalid ticket id. Use format like engine-003.");
			state = setState(pi, ctx, { ...state, ticketId, source: "tool" });
			return {
				content: [{ type: "text", text: `Workflow ticket set to ${ticketId}.` }],
				details: { ticketId },
			};
		},
	});

	pi.registerTool({
		name: "end_focus",
		label: "End Focus",
		description: "End active focus mode after the work is completed or blocked.",
		promptSnippet: "End focus mode with an outcome and concise summary",
		promptGuidelines: [
			"When focus mode is active, call end_focus only after the requested work is implemented and verified, or when progress requires user input or an external dependency.",
			"Do not call end_focus merely to report progress while actionable work remains.",
		],
		parameters: Type.Object({
			outcome: Type.Union([Type.Literal("completed"), Type.Literal("blocked")]),
			summary: Type.String({ minLength: 1, description: "Concise completion summary or blocker explanation" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!state.execution) throw new Error("Focus mode is not active.");
			const result = transition(state, { type: "end-focus" });
			state = setState(pi, ctx, result.state);
			ctx.ui.notify(`Focus mode ended: ${params.outcome}.`, "info");
			return {
				content: [
					{
						type: "text",
						text: `Focus mode ended with outcome ${params.outcome}. Give the user a final response now. Summary: ${params.summary}`,
					},
				],
				details: { outcome: params.outcome, summary: params.summary },
			};
		},
	});

	pi.registerShortcut(ADVANCE_SHORTCUT, {
		description: "Run the next workflow skill, or clear after commit, on double press",
		handler: async (ctx) => {
			if (!state.activeStep) {
				ctx.ui.notify("No active workflow step to advance.", "warning");
				lastAdvanceShortcutAt = 0;
				return;
			}
			if (!ctx.isIdle()) {
				ctx.ui.notify("Wait for the current turn to finish before advancing workflow.", "warning");
				lastAdvanceShortcutAt = 0;
				return;
			}
			if (ctx.ui.getEditorText().length > 0) {
				ctx.ui.notify("Editor has unsent text. Clear it before advancing workflow.", "warning");
				lastAdvanceShortcutAt = 0;
				return;
			}

			const nextStep = getNextStep(state.activeStep);
			const command = nextStep ? buildSkillCommand(nextStep, state.ticketId) : undefined;
			const now = Date.now();
			if (now - lastAdvanceShortcutAt > ADVANCE_DOUBLE_PRESS_MS) {
				lastAdvanceShortcutAt = now;
				ctx.ui.notify(`Again to ${command ? `run ${command}` : "clear workflow indicator"}`, "info");
				return;
			}

			lastAdvanceShortcutAt = 0;
			if (!nextStep) {
				state = clearState(pi, ctx);
				ctx.ui.notify("Workflow indicator cleared.", "info");
				return;
			}

			state = setState(pi, ctx, {
				...state,
				activeStep: nextStep,
				execution: undefined,
				source: "shortcut",
			});
			pi.sendUserMessage(command);
		},
	});

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" };

		const skillName = extractSkill(event.text);
		if (skillName === FOCUS_SKILL) {
			const result = transition(state, {
				type: "activate-focus",
				ticketId: extractSkillTicket(event.text) ?? ticketIdFrom(event.text),
				runId: newRunId(),
			});
			state = setState(pi, ctx, { ...result.state, source: "input" });
			ctx.ui.notify("Focus mode enabled.", "info");
			return { action: "continue" };
		}

		const stepName = extractStep(event.text);
		if (stepName) {
			const interrupted = state.execution
				? transition(state, { type: "ordinary-input" })
				: { state, effects: [] as RuntimeEffect[] };
			state = setState(pi, ctx, {
				...interrupted.state,
				activeStep: stepName,
				ticketId: extractSkillTicket(event.text) ?? state.ticketId,
				source: "input",
			});
			applyEffects(pi, ctx, () => state, interrupted.effects, continuationQueue);
			return { action: "continue" };
		}

		if (state.execution) {
			const result = transition(state, { type: "ordinary-input" });
			state = setState(pi, ctx, result.state);
			applyEffects(pi, ctx, () => state, result.effects, continuationQueue);
		}
		return { action: "continue" };
	});

	pi.on("agent_end", async (_event, ctx) => {
		if (!state.execution) return;
		const result = transition(state, { type: "agent-end" });
		state = setState(pi, ctx, result.state);
		applyEffects(pi, ctx, () => state, result.effects, continuationQueue);
	});

	pi.on("before_agent_start", async (event) => {
		let addition: string | undefined;
		if (state.execution) addition = focusContract(state);
		else if (state.ticketId) addition = `Active workflow ticket: ${state.ticketId}`;
		if (!addition) return;
		return { systemPrompt: `${event.systemPrompt}\n\n${addition}` };
	});

	pi.on("session_compact", async (event, ctx) => {
		const result = transition(state, { type: "session-compact", reason: event.reason });
		state = result.state;
		applyWidget(ctx, state);
	});

	pi.on("session_start", async (event, ctx) => {
		const restored = event.reason === "new" ? {} : findLatestState(ctx.sessionManager.getBranch());
		const result = transition(restored, { type: "session-boundary", reason: event.reason });
		if (event.reason === "fork" || result.effects.length) {
			state = setState(pi, ctx, result.state);
			applyEffects(pi, ctx, () => state, result.effects, continuationQueue);
			return;
		}

		state = result.state;
		applyWidget(ctx, state);
	});

	pi.on("session_shutdown", async () => {
		syncFocusPulse(false);
		activeTui = undefined;
	});
}
