import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";

const ENTRY_TYPE = "workflow-indicator";
const WIDGET_ID = "workflow-indicator";
const SKILL_PREFIX = /^\/skill:([a-z0-9-]+)(?:\s|$)/;

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
	source?: "input" | "command";
	updatedAt?: number;
};

type CustomEntry = {
	type: string;
	customType?: string;
	data?: IndicatorState;
};

function isStepName(value: string): value is StepName {
	return WORKFLOW.some((step) => step.id === value);
}

function getStep(stepName?: StepName) {
	return WORKFLOW.find((step) => step.id === stepName);
}

function getStepIndex(stepName?: StepName): number {
	return WORKFLOW.findIndex((step) => step.id === stepName);
}

function extractStep(text: string): StepName | undefined {
	const stepName = text.match(SKILL_PREFIX)?.[1];
	return stepName && isStepName(stepName) ? stepName : undefined;
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

function renderTicket(theme: ExtensionContext["ui"]["theme"], ticketId?: string): string {
	return ticketId ? `${theme.fg(TOKENS.rail, " · ")}${theme.fg(TOKENS.ticket, ticketId)}` : "";
}

function renderRail(state: IndicatorState, theme: ExtensionContext["ui"]["theme"]): { full: string; compact: string } {
	const activeStep = getStep(state.activeStep);
	if (!activeStep) return { full: "", compact: "" };

	const separator = theme.fg(TOKENS.rail, " ─ ");
	const full = WORKFLOW.map((step) => {
		if (step.id === activeStep.id) {
			return theme.bg(TOKENS.activeBg, theme.fg(TOKENS.activeFg, step.short));
		}
		return theme.fg(TOKENS.muted, step.short);
	}).join(separator);

	const compact = `${theme.fg(TOKENS.muted, `${getStepIndex(activeStep.id) + 1}/${WORKFLOW.length} `)}${theme.bg(
		TOKENS.activeBg,
		theme.fg(TOKENS.activeFg, activeStep.short),
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

function applyWidget(ctx: ExtensionContext, state: IndicatorState): void {
	if (!state.activeStep) {
		ctx.ui.setWidget(WIDGET_ID, undefined);
		return;
	}

	ctx.ui.setWidget(WIDGET_ID, (_tui, theme) => ({
		render(width: number): string[] {
			const line = renderIndicator(width, state, theme);
			return line ? [line] : [];
		},
		invalidate(): void {},
	}));
}

export default function workflowIndicator(pi: ExtensionAPI): void {
	let state: IndicatorState = {};

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

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") {
			return { action: "continue" };
		}

		const stepName = extractStep(event.text);
		if (!stepName) {
			return { action: "continue" };
		}

		state = setState(pi, ctx, {
			...state,
			activeStep: stepName,
			ticketId: extractSkillTicket(event.text) ?? state.ticketId,
			source: "input",
		});
		return { action: "continue" };
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
}
