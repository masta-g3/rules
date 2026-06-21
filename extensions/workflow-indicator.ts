import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const ENTRY_TYPE = "workflow-indicator";
const WIDGET_ID = "workflow-indicator";
const SKILL_PREFIX = /^\/skill:([a-z0-9-]+)(?:\s|$)/;
const LONG_EXECUTE_SKILL = "long-execute";
const LONG_EXECUTE_CONTINUATION_PREFIX = "Continue long-execute for the same plan.";
const LONG_EXECUTE_CONTINUE_LABEL = "LONG EXECUTE CONTINUE";
const LONG_EXECUTE_DEFAULT_MAX_TURNS = 6;
const LEX_PULSE_MS = 700;
const ADVANCE_SHORTCUT = "ctrl+shift+right";
const ADVANCE_DOUBLE_PRESS_MS = 800;

const TOKENS = {
	muted: "dim",
	rail: "borderMuted",
	activeFg: "accent",
	activeBg: "selectedBg",
	ticket: "dim",
} as const;

const WORKFLOW = [
	{ id: "next-feature", short: "NX" },
	{ id: "prime", short: "PR" },
	{ id: "plan-md", short: "PL" },
	{ id: "execute", short: "EX" },
	{ id: "review", short: "RV" },
	{ id: "reflect", short: "RF" },
	{ id: "commit", short: "CM" },
] as const;

const TICKET_PATTERN = /\b([a-z][a-z0-9-]*-\d{3})\b/i;
const TICKET_ARG_PATTERN = /^([a-z][a-z0-9-]*-\d{3})$/i;

type StepName = (typeof WORKFLOW)[number]["id"];

type IndicatorState = {
	activeStep?: StepName;
	ticketId?: string;
	executionMode?: "long";
	longTurnCount?: number;
	longMaxTurns?: number;
	source?: "input" | "command" | "shortcut" | "tool";
	updatedAt?: number;
};

type CustomEntry = {
	type: string;
	customType?: string;
	data?: IndicatorState;
};

let activeTui: TUI | undefined;
let lexPulseOn = true;
let lexPulseTimer: ReturnType<typeof setInterval> | undefined;

function syncLexPulse(active: boolean): void {
	if (!active) {
		if (lexPulseTimer) clearInterval(lexPulseTimer);
		lexPulseTimer = undefined;
		lexPulseOn = true;
		return;
	}

	if (lexPulseTimer) return;
	lexPulseTimer = setInterval(() => {
		lexPulseOn = !lexPulseOn;
		activeTui?.requestRender();
	}, LEX_PULSE_MS);
}

function isStepName(value: string): value is StepName {
	return WORKFLOW.some((step) => step.id === value);
}

function getStep(stepName?: StepName) {
	return WORKFLOW.find((step) => step.id === stepName);
}

function getStepIndex(stepName?: StepName): number {
	return WORKFLOW.findIndex((step) => step.id === stepName);
}

function getNextStep(stepName?: StepName): StepName | undefined {
	const index = getStepIndex(stepName);
	return index >= 0 ? WORKFLOW[index + 1]?.id : undefined;
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

function isLongExecuteContinuation(text: string): boolean {
	return text.trimStart().startsWith(LONG_EXECUTE_CONTINUATION_PREFIX);
}

function extractSkillTicket(text: string): string | undefined {
	const skillCall = text.match(/^\/skill:[a-z0-9-]+\s+([^\s]+)/i)?.[1];
	return skillCall && TICKET_ARG_PATTERN.test(skillCall) ? skillCall.toLowerCase() : undefined;
}

function parseTicketArg(text: string): string | undefined {
	const ticketId = text.trim().match(TICKET_ARG_PATTERN)?.[1];
	return ticketId?.toLowerCase();
}

function findLatestState(entries: unknown[]): IndicatorState {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i] as CustomEntry;
		if (entry?.type !== "custom" || entry.customType !== ENTRY_TYPE) continue;
		if (!entry.data || typeof entry.data !== "object") return {};
		return entry.data;
	}
	return {};
}

function persistState(pi: ExtensionAPI, state: IndicatorState): void {
	pi.appendEntry(ENTRY_TYPE, state);
}

function setState(pi: ExtensionAPI, ctx: ExtensionContext, nextState: IndicatorState): IndicatorState {
	const state = { ...nextState, updatedAt: Date.now() };
	persistState(pi, state);
	applyWidget(ctx, state);
	return state;
}

function clearState(pi: ExtensionAPI, ctx: ExtensionContext): IndicatorState {
	return setState(pi, ctx, {});
}

function clearLongMode(pi: ExtensionAPI, ctx: ExtensionContext, state: IndicatorState): IndicatorState {
	return setState(pi, ctx, {
		...state,
		executionMode: undefined,
		longTurnCount: undefined,
		longMaxTurns: undefined,
	});
}

function renderTicket(theme: ExtensionContext["ui"]["theme"], ticketId?: string): string {
	return ticketId ? `${theme.fg(TOKENS.rail, " · ")}${theme.fg(TOKENS.ticket, ticketId)}` : "";
}

function renderStepShort(step: (typeof WORKFLOW)[number], state: IndicatorState): string {
	if (step.id === "execute" && state.executionMode === "long") return lexPulseOn ? "LEX ✦" : "LEX ✧";
	return step.short;
}

function renderRail(state: IndicatorState, theme: ExtensionContext["ui"]["theme"]): { full: string; compact: string } {
	const activeStep = getStep(state.activeStep);
	if (!activeStep) return { full: "", compact: "" };

	const separator = theme.fg(TOKENS.rail, " ─ ");
	const full = WORKFLOW.map((step) => {
		const short = renderStepShort(step, state);
		if (step.id === activeStep.id) {
			return theme.bg(TOKENS.activeBg, theme.fg(TOKENS.activeFg, short));
		}
		return theme.fg(TOKENS.muted, short);
	}).join(separator);

	const compact = `${theme.fg(TOKENS.muted, `${getStepIndex(activeStep.id) + 1}/${WORKFLOW.length} `)}${theme.bg(
		TOKENS.activeBg,
		theme.fg(TOKENS.activeFg, renderStepShort(activeStep, state)),
	)}`;
	return { full, compact };
}

function renderIndicator(width: number, state: IndicatorState, theme: ExtensionContext["ui"]["theme"]): string {
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

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
	return message.role === "assistant" && Array.isArray(message.content);
}

function assistantText(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

function finalAssistantLines(messages: AgentMessage[]): string[] {
	const lastAssistant = [...messages].reverse().find(isAssistantMessage);
	if (!lastAssistant) return [];

	return assistantText(lastAssistant)
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

function isLongExecuteStopLabel(label: string): boolean {
	return label === "READY FOR REVIEW" || label === "NEEDS USER" || label === "PENDING STEPS" || label.startsWith("BLOCKED");
}

function shouldClearLongMode(messages: AgentMessage[], state: IndicatorState): boolean {
	const lines = finalAssistantLines(messages);
	if (lines.some(isLongExecuteStopLabel)) return true;
	if (lines.at(-1) !== LONG_EXECUTE_CONTINUE_LABEL) return true;
	return (state.longTurnCount ?? 0) + 1 >= (state.longMaxTurns ?? LONG_EXECUTE_DEFAULT_MAX_TURNS);
}

function nextLongModeState(state: IndicatorState): IndicatorState {
	return {
		...state,
		longTurnCount: (state.longTurnCount ?? 0) + 1,
		longMaxTurns: state.longMaxTurns ?? LONG_EXECUTE_DEFAULT_MAX_TURNS,
	};
}

function applyWidget(ctx: ExtensionContext, state: IndicatorState): void {
	syncLexPulse(state.executionMode === "long");

	if (!state.activeStep) {
		ctx.ui.setWidget(WIDGET_ID, undefined);
		return;
	}

	ctx.ui.setWidget(WIDGET_ID, (tui, theme) => {
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

export default function workflowIndicator(pi: ExtensionAPI): void {
	let state: IndicatorState = {};
	let lastAdvanceShortcutAt = 0;

	pi.registerCommand("wf-ticket", {
		description: "Set or override the active workflow ticket",
		handler: async (args, ctx) => {
			if (!args?.trim()) {
				ctx.ui.notify("Usage: /wf-ticket <ticket-id>", "warning");
				return;
			}
			const ticketId = parseTicketArg(args);
			if (!ticketId) {
				ctx.ui.notify("Invalid ticket id. Use exactly one ticket token.", "warning");
				return;
			}
			state = setState(pi, ctx, { ...state, ticketId, source: "command" });
			ctx.ui.notify(
				state.activeStep
					? `Workflow ticket set to ${ticketId}.`
					: `Workflow ticket set to ${ticketId}. Context is active now; it will appear in the rail on the next workflow step.`,
				"info",
			);
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
			const actionDescription = command ?? "clear workflow indicator";
			const now = Date.now();
			if (now - lastAdvanceShortcutAt > ADVANCE_DOUBLE_PRESS_MS) {
				lastAdvanceShortcutAt = now;
				ctx.ui.notify(`Again to ${command ? `run ${command}` : actionDescription}`, "info");
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
				executionMode: undefined,
				longTurnCount: undefined,
				longMaxTurns: undefined,
				source: "shortcut",
			});
			pi.sendUserMessage(command);
		},
	});

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") {
			if (state.executionMode === "long" && !isLongExecuteContinuation(event.text)) state = clearLongMode(pi, ctx, state);
			return { action: "continue" };
		}

		const skillName = extractSkill(event.text);
		if (skillName === LONG_EXECUTE_SKILL) {
			state = setState(pi, ctx, {
				...state,
				activeStep: "execute",
				ticketId: extractSkillTicket(event.text) ?? state.ticketId,
				executionMode: "long",
				longTurnCount: 0,
				longMaxTurns: LONG_EXECUTE_DEFAULT_MAX_TURNS,
				source: "input",
			});
			return { action: "continue" };
		}

		const stepName = extractStep(event.text);
		if (!stepName) {
			if (state.executionMode === "long" && !isLongExecuteContinuation(event.text)) state = clearLongMode(pi, ctx, state);
			return { action: "continue" };
		}

		state = setState(pi, ctx, {
			...state,
			activeStep: stepName,
			ticketId: extractSkillTicket(event.text) ?? state.ticketId,
			executionMode: undefined,
			longTurnCount: undefined,
			longMaxTurns: undefined,
			source: "input",
		});
		return { action: "continue" };
	});

	pi.on("agent_end", async (event, ctx) => {
		if (state.executionMode !== "long") return;

		state = shouldClearLongMode(event.messages, state) ? clearLongMode(pi, ctx, state) : setState(pi, ctx, nextLongModeState(state));
	});

	pi.on("before_agent_start", async (event) => {
		if (!state.ticketId) return;
		return {
			systemPrompt: `${event.systemPrompt}\n\nActive workflow ticket: ${state.ticketId}`,
		};
	});

	pi.on("session_start", async (event, ctx) => {
		if (event.reason === "new") {
			state = {};
			applyWidget(ctx, state);
			return;
		}

		if (event.reason === "fork") {
			state = clearState(pi, ctx);
			ctx.ui.notify("Workflow indicator cleared in forked session.", "info");
			return;
		}

		state = findLatestState(ctx.sessionManager.getBranch());
		applyWidget(ctx, state);
	});

	pi.on("session_shutdown", async () => {
		syncLexPulse(false);
		activeTui = undefined;
	});
}
