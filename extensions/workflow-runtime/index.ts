import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import { keyHint, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { Box, Spacer, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
	createContinuationQueue,
	transition,
	WORKFLOW_STEPS,
	type RuntimeEffect,
	type StepName,
	type WorkflowState,
} from "./core.ts";

const ENTRY_TYPE = "workflow-runtime";
const EVENT_TYPE = "workflow-runtime-event";
const SKILL_PREFIX = /^\/skill:([a-z0-9-]+)(?:\s|$)/;
const LONG_EXECUTE_SKILL = "long-execute";
const TICKET_PATTERN = /\b([a-z][a-z0-9-]*-\d{3})\b/i;
const TICKET_ARG_PATTERN = /^([a-z][a-z0-9-]*-\d{3})$/i;
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

const STEP_SHORT: Record<StepName, string> = {
	"next-feature": "NX",
	prime: "PR",
	"plan-md": "PL",
	execute: "EX",
	review: "RV",
	reflect: "RF",
	commit: "CM",
};

const WORKFLOW = WORKFLOW_STEPS.map((id) => ({ id, short: STEP_SHORT[id] }));

const STOP_NOTICES: Record<Exclude<RuntimeEffect, { kind: "continue" }>["reason"], string> = {
	ready: "Long-execute stopped: ready for review.",
	blocked: "Long-execute stopped: blocked or user input is required.",
	"missing-marker": "Long-execute stopped: no continuation marker.",
	limit: "Long-execute stopped: six-turn limit reached.",
	"user-interruption": "Manual input clears active long-execute state.",
	"session-boundary": "Long-execute stopped at a session boundary. Reinvoke /skill:long-execute to continue.",
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
	if (step.id === "execute" && state.execution?.mode === "long") return lexPulseOn ? "LEX ✦" : "LEX ✧";
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
	syncLexPulse(state.execution?.mode === "long");
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

function longExecuteContract(state: WorkflowState): string {
	const execution = state.execution;
	if (!execution) return "";
	const ticket = state.ticketId ? ` for ticket ${state.ticketId}` : "";
	return `Long-execute is active${ticket}, with ${execution.turnsCompleted}/${execution.maxTurns} turns completed. Follow \`$SKILLS_ROOT/execute/SKILL.md\` and the current plan. End with \`READY FOR REVIEW\`, \`BLOCKED — <reason>\`, or exact final-line \`LONG EXECUTE CONTINUE\`. Do not use \`PENDING STEPS\` while safe implementation work remains.`;
}

function continuationContent(state: WorkflowState): string {
	const execution = state.execution;
	if (!execution) return "";
	const ticket = state.ticketId ? `\nActive ticket: ${state.ticketId}` : "";
	return `Continue long-execute for the same plan.${ticket}
Turns completed: ${execution.turnsCompleted}/${execution.maxTurns}

Re-read \`$SKILLS_ROOT/execute/SKILL.md\` and the current plan checklist, then take the next safe implementation or verification step. Verify completed items against the repository and run relevant checks before declaring completion.

Use one terminal label:
- \`READY FOR REVIEW\`
- \`BLOCKED — <reason>\`
- \`LONG EXECUTE CONTINUE\`

Do not use \`PENDING STEPS\` while safe work remains. The continue marker must be the entire final line exactly: \`LONG EXECUTE CONTINUE\`.`;
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
		const progress = execution ? ` · next turn ${execution.turnsCompleted + 1}/${execution.maxTurns}` : "";
		if (!expanded) {
			return new Text(
				`${theme.fg("customMessageLabel", theme.bold("Workflow"))}${theme.fg("dim", " · ")}${theme.fg("customMessageText", `Long execute continuing${progress}`)} ${theme.fg("dim", `(${keyHint("app.tools.expand", "to expand")})`)}`,
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
		if (skillName === LONG_EXECUTE_SKILL) {
			const result = transition(state, {
				type: "activate-long",
				ticketId: extractSkillTicket(event.text) ?? ticketIdFrom(event.text),
				runId: newRunId(),
			});
			state = setState(pi, ctx, { ...result.state, source: "input" });
			ctx.ui.notify("Long-execute enabled.", "info");
			return { action: "continue" };
		}

		const stepName = extractStep(event.text);
		if (stepName) {
			state = setState(pi, ctx, {
				...state,
				activeStep: stepName,
				ticketId: extractSkillTicket(event.text) ?? state.ticketId,
				execution: undefined,
				source: "input",
			});
			return { action: "continue" };
		}

		if (state.execution) {
			const result = transition(state, { type: "ordinary-input" });
			state = setState(pi, ctx, result.state);
			applyEffects(pi, ctx, () => state, result.effects, continuationQueue);
		}
		return { action: "continue" };
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!state.execution) return;
		const result = transition(state, {
			type: "agent-end",
			finalAssistantLines: finalAssistantLines(event.messages),
		});
		state = setState(pi, ctx, result.state);
		applyEffects(pi, ctx, () => state, result.effects, continuationQueue);
	});

	pi.on("before_agent_start", async (event) => {
		let addition: string | undefined;
		if (state.execution) addition = longExecuteContract(state);
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
		syncLexPulse(false);
		activeTui = undefined;
	});
}
