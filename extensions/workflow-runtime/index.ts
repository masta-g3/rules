import { keyHint, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import type { TUI } from "@earendil-works/pi-tui";
import { Box, Spacer, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import {
	completeWorkflow,
	continuationContent,
	createContinuationQueue,
	finalAssistantStopReason,
	FOCUS_MODE_DISPLAY,
	focusScope,
	positionalMarker,
	recoverFocus,
	setWorkflowActivity,
	setWorkflowTicketState,
	shouldNormalizeWorkflowDefinition,
	startWorkflowStep,
	transition,
	withWorkflowDefinition,
	WORKFLOW_ACTIVITIES,
	WORKFLOW_DEFINITION,
	type RuntimeEffect,
	type StepName,
	type WorkflowState,
} from "./core.ts";
import {
	ATTENTION_PROMPT,
	CONTEXT_ENTRY_TYPE,
	NAMING_PROMPT,
	attentionInput,
	contextSnapshot,
	effectiveProjectCwd,
	normalizeText,
	parseAttention,
	parseContextSnapshot,
	questionAttention,
	readTicketContext,
	recentTranscript,
	sanitizeSessionName,
	stableRequestId,
	ticketNamingInput,
	type PiAgentHubContextV1,
	type SessionAttention,
	type TicketContext,
	type TranscriptEntry,
} from "./session-context.ts";
import {
	createSessionModelCall,
	type MetadataCallResult,
	type MetadataFailureKind,
	type SessionModelCall,
} from "./session-model.ts";
import { applyPlanWidget } from "./plan-widget.ts";
import { readWorkflowPlan } from "./workflow-plan.ts";
import { TodoPanel, TODO_PANEL_OVERLAY_OPTIONS, TODO_PANEL_SHORTCUT } from "./todo-panel.ts";

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

const WORKFLOW = WORKFLOW_DEFINITION;
const ACTIVITY_IDS = Object.values(WORKFLOW_ACTIVITIES).flatMap((items) => items.map((item) => item.id));

const STOP_NOTICES: Record<Exclude<RuntimeEffect, { kind: "continue" }>["reason"], string> = {
	"session-boundary": "Focus mode stopped at a session boundary. Reinvoke /skill:focus to continue.",
};

type CustomEntry = {
	type: string;
	customType?: string;
	data?: WorkflowState & { steps?: unknown; activeMode?: unknown };
};

type RestoredState = {
	state: WorkflowState;
	steps?: unknown;
};

type RuntimeEventDetails = {
	kind: "continuation" | "recovery";
	state: WorkflowState;
};

type MetadataIndicatorState = {
	state: "ready" | "working" | "success" | "failure";
	failureKind?: MetadataFailureKind | "parse";
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

function deliveredSkill(text: string): { name: string; ticketId?: string } | undefined {
	const rawName = extractSkill(text);
	if (rawName) return { name: rawName, ticketId: extractSkillTicket(text) };
	const name = text.match(/^<skill name="([a-z0-9-]+)"(?:\s[^>]*)?>/)?.[1];
	if (!name) return undefined;
	const closing = text.lastIndexOf("</skill>");
	const arg = closing >= 0 ? text.slice(closing + "</skill>".length).trim().split(/\s+/, 1)[0] : undefined;
	return { name, ...(arg && TICKET_ARG_PATTERN.test(arg) ? { ticketId: arg.toLowerCase() } : {}) };
}

function userMessageText(message: unknown): string | undefined {
	if (!message || typeof message !== "object" || !("role" in message) || message.role !== "user" || !("content" in message)) return undefined;
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return undefined;
	return message.content
		.filter((part): part is { type: "text"; text: string } => Boolean(part && typeof part === "object" && part.type === "text" && typeof part.text === "string"))
		.map((part) => part.text)
		.join("\n");
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

function findLatestContext(entries: unknown[]): PiAgentHubContextV1 | undefined {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i] as { type?: string; customType?: string; data?: unknown };
		if (entry?.type !== "custom" || entry.customType !== CONTEXT_ENTRY_TYPE) continue;
		return parseContextSnapshot(entry.data);
	}
	return undefined;
}

function findLatestState(entries: unknown[]): RestoredState {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i] as CustomEntry;
		if (entry?.type === "custom" && entry.customType === ENTRY_TYPE && entry.data) {
			const { steps, activeMode: _activeMode, ...state } = entry.data;
			return { state, steps };
		}
	}
	return { state: {} };
}

function persistState(pi: ExtensionAPI, state: WorkflowState): void {
	pi.appendEntry(ENTRY_TYPE, withWorkflowDefinition(state));
}

function renderTicket(theme: ExtensionContext["ui"]["theme"], ticketId?: string): string {
	return ticketId ? `${theme.fg(TOKENS.rail, " · ")}${theme.fg(TOKENS.ticket, ticketId)}` : "";
}

function focusShort(): string {
	return FOCUS_MODE_DISPLAY.label;
}

function renderStepShort(step: (typeof WORKFLOW)[number], state: WorkflowState): string {
	if (step.id === "execute" && state.execution?.mode === "focus") return focusShort();
	return step.short;
}

function renderRail(state: WorkflowState, theme: ExtensionContext["ui"]["theme"]): { full: string; compact: string } {
	const activeStep = getStep(state.activeStep);
	if (!activeStep) {
		if (state.execution?.scope !== "standalone") return { full: "", compact: "" };
		const focus = theme.bg(TOKENS.activeBg, theme.fg(TOKENS.activeFg, focusShort()));
		return { full: focus, compact: focus };
	}

	const separator = theme.fg(TOKENS.rail, " ─ ");
	const activeIndex = getStepIndex(activeStep.id);
	const full = WORKFLOW.map((step, index) => {
		const marker = positionalMarker(index, activeIndex, state.currentStepComplete === true);
		const focused = step.id === "execute" && index === activeIndex && state.execution?.mode === "focus";
		const displayMarker = focused ? (focusPulseOn ? "◆" : "◇") : marker;
		const display = `${displayMarker} ${step.id === "execute" && state.execution?.mode === "focus" ? renderStepShort(step, state) : step.label}`;
		return index === activeIndex && marker === "◉"
			? theme.bg(TOKENS.activeBg, theme.fg(TOKENS.activeFg, display))
			: theme.fg(index <= activeIndex ? TOKENS.activeFg : TOKENS.muted, display);
	}).join(separator);

	const focused = activeStep.id === "execute" && state.execution?.mode === "focus";
	const marker = focused ? (focusPulseOn ? "◆" : "◇") : positionalMarker(activeIndex, activeIndex, state.currentStepComplete === true);
	const positioned = `${marker} ${renderStepShort(activeStep, state)}`;
	const compact = `${theme.fg(TOKENS.muted, `${activeIndex + 1}/${WORKFLOW.length} `)}${
		marker === "◉" ? theme.bg(TOKENS.activeBg, theme.fg(TOKENS.activeFg, positioned)) : theme.fg(TOKENS.activeFg, positioned)
	}`;
	return { full, compact };
}

function renderMetadataBadge(theme: ExtensionContext["ui"]["theme"], metadata: MetadataIndicatorState): string {
	if (metadata.state === "working") return theme.fg("accent", "◆ meta");
	if (metadata.state !== "failure") return theme.fg("dim", "◇ meta");
	return metadata.failureKind === "authentication"
		? theme.fg("error", "◇× meta")
		: theme.fg("warning", "◇! meta");
}

function renderIndicator(
	width: number,
	state: WorkflowState,
	metadata: MetadataIndicatorState,
	theme: ExtensionContext["ui"]["theme"],
): string {
	const rail = renderRail(state, theme);
	const badge = renderMetadataBadge(theme, metadata);
	if (!rail.full) return truncateToWidth(badge, width);

	const ticket = renderTicket(theme, state.ticketId);
	const suffix = `${theme.fg(TOKENS.rail, " · ")}${badge}`;
	const full = `${rail.full}${ticket}${suffix}`;
	if (visibleWidth(full) <= width) return full;

	const compact = `${rail.compact}${ticket}${suffix}`;
	if (visibleWidth(compact) <= width) return compact;

	const compactWithBadge = `${rail.compact}${suffix}`;
	if (visibleWidth(compactWithBadge) <= width) return compactWithBadge;

	return truncateToWidth(rail.compact, width);
}

function applyWidget(ctx: ExtensionContext, state: WorkflowState, metadata: MetadataIndicatorState): void {
	syncFocusPulse(state.execution?.mode === "focus");
	ctx.ui.setWidget(ENTRY_TYPE, (tui, theme) => {
		activeTui = tui;
		return {
			render(width: number): string[] {
				const line = renderIndicator(width, state, metadata, theme);
				return line ? [line] : [];
			},
			invalidate(): void {},
		};
	});
}

function focusMessage(state: WorkflowState, kind: RuntimeEventDetails["kind"], display: boolean) {
	return {
		customType: EVENT_TYPE,
		content: continuationContent(state),
		display,
		details: { kind, state } satisfies RuntimeEventDetails,
	};
}

function emitContinuation(pi: ExtensionAPI, state: WorkflowState): void {
	pi.sendMessage(focusMessage(state, "continuation", true), {
		triggerTurn: true,
		deliverAs: "followUp",
	});
}

function emitRecovery(pi: ExtensionAPI, state: WorkflowState): void {
	pi.sendMessage(focusMessage(state, "recovery", false), { deliverAs: "steer" });
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

type MetadataOperation = "session name" | "attention";
type MetadataStatus = MetadataIndicatorState & {
	operation?: MetadataOperation;
	result?: MetadataCallResult;
	parsedResult?: string;
};

const METADATA_STATUS_ID = "session-metadata";

function metadataFailureNotice(kind: MetadataFailureKind | "parse"): string {
	if (kind === "authentication") return "Session metadata authentication failed. Run /login openai-codex.";
	if (kind === "unsupported") return "Session metadata unavailable. The configured model is unsupported for this account.";
	if (kind === "timeout") return "Session metadata request timed out. The extension remains active.";
	if (kind === "parse") return "Session metadata returned an invalid result. Run /session-metadata-status for details.";
	return "Session metadata request failed. Run /session-metadata-status for details.";
}

function metadataStatusReport(status: MetadataStatus): string {
	if (status.state === "ready") return "Session metadata extension: active\nNo metadata request has run in this session.";
	if (status.state === "working") return `Session metadata: generating ${status.operation ?? "metadata"}`;
	const result = status.result;
	const lines = [
		`Session metadata: ${status.state === "success" ? "success" : `${status.failureKind ?? "unknown"} failure`}`,
		status.operation ? `Operation: ${status.operation}` : undefined,
		result?.model ? `Model: ${result.model}` : undefined,
		result ? `Latency: ${result.latencyMs} ms` : undefined,
		status.parsedResult ? `Parsed result: ${status.parsedResult}` : undefined,
		result?.failure?.message ? `Error: ${result.failure.message}` : undefined,
		result?.attempts.length ? `Attempts: ${result.attempts.map((attempt) => `${attempt.model} ${attempt.failure?.kind ?? attempt.outcome} (${attempt.latencyMs} ms)`).join(", ")}` : undefined,
		result?.skippedModels.length ? `Skipped: ${result.skippedModels.join(", ")}` : undefined,
	];
	return lines.filter((line): line is string => Boolean(line)).join("\n");
}

export default function workflowRuntime(
	pi: ExtensionAPI,
	dependencies: { modelCall?: SessionModelCall } = {},
): void {
	const modelCall = dependencies.modelCall ?? createSessionModelCall();
	let state: WorkflowState = {};
	let ticketContext: TicketContext | undefined;
	let recoveryPending = false;
	let lastAdvanceShortcutAt = 0;
	let generation = 0;
	let automaticNamingStarted = false;
	let currentAttention: SessionAttention | undefined;
	let attentionGenerationDone = -1;
	let latestUserRequest: string | undefined;
	let deferredWorkflowInputs: Array<{ name: string; ticketId?: string; text: string }> = [];
	let metadataStatus: MetadataStatus = { state: "ready" };
	let settledMetadataStatus = metadataStatus;
	let metadataRequest = 0;
	let settledMetadataRequest = 0;
	let lastMetadataWarning: MetadataFailureKind | "parse" | undefined;
	const continuationQueue = createContinuationQueue();

	const applyMetadataStatus = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		applyWidget(ctx, state, metadataStatus);
	};

	const setState = (pi: ExtensionAPI, ctx: ExtensionContext, nextState: WorkflowState): WorkflowState => {
		const updated = { ...nextState, updatedAt: Date.now() };
		persistState(pi, updated);
		applyWidget(ctx, updated, metadataStatus);
		applyPlanWidget(ctx, updated.plan);
		return updated;
	};

	const clearState = (pi: ExtensionAPI, ctx: ExtensionContext): WorkflowState => setState(pi, ctx, {});

	const rememberMetadataStatus = (requestId: number, status: MetadataStatus) => {
		if (requestId <= settledMetadataRequest) return;
		settledMetadataRequest = requestId;
		settledMetadataStatus = status;
	};

	const callMetadata = async <T>(
		ctx: ExtensionContext,
		operation: MetadataOperation,
		systemPrompt: string,
		input: string,
		maxTokens: 64 | 128,
		parse: (raw: string) => T | undefined,
	): Promise<T | undefined> => {
		const requestGeneration = generation;
		const requestId = ++metadataRequest;
		metadataStatus = { state: "working", operation };
		applyMetadataStatus(ctx);
		let result: MetadataCallResult;
		try {
			result = await modelCall(ctx, systemPrompt, input, maxTokens);
		} catch (error) {
			result = {
				outcome: "failure",
				latencyMs: 0,
				failure: { kind: "provider", message: error instanceof Error ? error.message : String(error) },
				attempts: [],
				skippedModels: [],
			};
		}
		if (requestGeneration !== generation) {
			if (requestId === metadataRequest) {
				metadataStatus = settledMetadataStatus;
				applyMetadataStatus(ctx);
			}
			return undefined;
		}
		const isLatestRequest = requestId === metadataRequest;
		if (result.outcome === "failure") {
			const failureKind = result.failure?.kind ?? "provider";
			const nextStatus: MetadataStatus = { state: "failure", operation, result, failureKind };
			rememberMetadataStatus(requestId, nextStatus);
			if (isLatestRequest) {
				metadataStatus = nextStatus;
				applyMetadataStatus(ctx);
				if (lastMetadataWarning !== failureKind) ctx.ui.notify(metadataFailureNotice(failureKind), "warning");
				lastMetadataWarning = failureKind;
			}
			return undefined;
		}
		const parsed = parse(result.text ?? "");
		if (parsed === undefined) {
			const nextStatus: MetadataStatus = { state: "failure", operation, result, failureKind: "parse" };
			rememberMetadataStatus(requestId, nextStatus);
			if (isLatestRequest) {
				metadataStatus = nextStatus;
				applyMetadataStatus(ctx);
				if (lastMetadataWarning !== "parse") ctx.ui.notify(metadataFailureNotice("parse"), "warning");
				lastMetadataWarning = "parse";
			}
			return undefined;
		}
		const parsedResult = typeof parsed === "string" ? parsed : JSON.stringify(parsed);
		const nextStatus: MetadataStatus = { state: "success", operation, result, parsedResult };
		rememberMetadataStatus(requestId, nextStatus);
		if (isLatestRequest) {
			metadataStatus = nextStatus;
			lastMetadataWarning = undefined;
			applyMetadataStatus(ctx);
		}
		return parsed;
	};

	const publishContext = (attention?: SessionAttention) => {
		pi.appendEntry(CONTEXT_ENTRY_TYPE, contextSnapshot(ticketContext, attention));
	};

	const refreshPlan = async (ctx: ExtensionContext) => {
		const requestGeneration = generation;
		const requestedTicket = ticketContext;
		const root = effectiveProjectCwd(ctx.cwd);
		const result = requestedTicket?.planFile ? await readWorkflowPlan(root, requestedTicket.planFile) : {};
		if (requestGeneration !== generation || requestedTicket?.id !== ticketContext?.id) return undefined;
		const projection = state.activeStep ? result.projection : undefined;
		const current = JSON.stringify(state.plan);
		if (JSON.stringify(projection) !== current) state = setState(pi, ctx, { ...state, plan: projection });
		else applyPlanWidget(ctx, state.plan);
		return { ticket: requestedTicket, plan: result.plan };
	};

	const selectTicket = async (
		ctx: ExtensionContext,
		ticketId: string,
		rename = true,
		attention?: typeof currentAttention,
		awaitGeneratedName = false,
	) => {
		const requestGeneration = ++generation;
		const selected = await readTicketContext(effectiveProjectCwd(ctx.cwd), ticketId) ?? { id: ticketId };
		if (requestGeneration !== generation) return false;
		ticketContext = selected;
		currentAttention = attention;
		publishContext(attention);
		let nameApplied = false;
		if (rename && ticketContext.title) {
			pi.setSessionName(ticketContext.title);
			nameApplied = true;
		} else if (rename) {
			const source = ticketNamingInput(ticketContext, recentTranscript(ctx.sessionManager.getBranch() as TranscriptEntry[]));
			const initialName = pi.getSessionName();
			const applyGeneratedName = async () => {
				const title = await callMetadata(ctx, "session name", NAMING_PROMPT, source, 64, sanitizeSessionName);
				if (requestGeneration !== generation || pi.getSessionName() !== initialName) return false;
				pi.setSessionName(title ?? ticketId);
				return true;
			};
			if (awaitGeneratedName) nameApplied = await applyGeneratedName();
			else void applyGeneratedName();
		}
		await refreshPlan(ctx);
		return nameApplied;
	};

	const generateName = async (ctx: ExtensionContext, source: string, explicit: boolean) => {
		if (!source || (!explicit && automaticNamingStarted)) return false;
		if (!explicit) automaticNamingStarted = true;
		const requestGeneration = explicit ? ++generation : generation;
		const initialName = pi.getSessionName();
		const name = await callMetadata(ctx, "session name", NAMING_PROMPT, source, 64, sanitizeSessionName);
		if (!name || requestGeneration !== generation || pi.getSessionName() !== initialName) return false;
		if (explicit) { ticketContext = undefined; publishContext(); }
		pi.setSessionName(name);
		return true;
	};

	pi.registerMessageRenderer(EVENT_TYPE, (message, { expanded }, theme) => {
		const details = message.details as RuntimeEventDetails | undefined;
		const eventState = details?.state;
		const execution = eventState?.execution;
		const progress = execution ? ` · next turn ${execution.turnsCompleted + 1}` : "";
		if (!expanded) {
			return new Text(
				`${theme.fg("customMessageLabel", theme.bold("Focus"))}${theme.fg("dim", " · ")}${theme.fg("customMessageText", `Continuing${progress}`)} ${theme.fg("dim", `(${keyHint("app.tools.expand", "to expand")})`)}`,
				0,
				0,
			);
		}

		const box = new Box(1, 1, (value) => theme.bg("customMessageBg", value));
		box.addChild(new Text(theme.fg("customMessageLabel", theme.bold("Focus")), 0, 0));
		box.addChild(new Spacer(1));
		box.addChild(new Text(theme.fg("customMessageText", String(message.content)), 0, 0));
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
			state = setState(pi, ctx, setWorkflowTicketState(state, ticketId, "command"));
			if (ticketContext?.id !== ticketId) await selectTicket(ctx, ticketId);
			ctx.ui.notify(`Workflow ticket set to ${ticketId}.`, "info");
		},
	});

	pi.registerCommand("wf-clear", {
		description: "Clear the workflow indicator",
		handler: async (_args, ctx) => {
			recoveryPending = false;
			state = clearState(pi, ctx);
			ctx.ui.notify("Workflow indicator cleared.", "info");
		},
	});

	pi.registerCommand("session-metadata-status", {
		description: "Show the latest session metadata model attempt",
		handler: async (_args, ctx) => ctx.ui.notify(metadataStatusReport(metadataStatus), "info"),
	});

	pi.registerCommand("session-name", {
		description: "Regenerate the native Pi session name (usage: /session-name refresh)",
		handler: async (args, ctx) => {
			if (args.trim() !== "refresh") return ctx.ui.notify("Usage: /session-name refresh", "warning");
			if (ticketContext) {
				const ticketId = ticketContext.id;
				const ok = await selectTicket(ctx, ticketId, true, currentAttention, true);
				return ctx.ui.notify(ok ? `Session name refreshed from ${ticketId}.` : "Could not refresh the session name.", ok ? "info" : "warning");
			}
			const ok = await generateName(ctx, recentTranscript(ctx.sessionManager.getBranch() as TranscriptEntry[]), true);
			ctx.ui.notify(ok ? "Session name refreshed." : "Could not refresh the session name.", ok ? "info" : "warning");
		},
	});

	const openTodos = async (ctx: ExtensionContext) => {
		const refreshed = await refreshPlan(ctx);
		if (!refreshed) return;
		if (!refreshed.ticket || !refreshed.plan) return ctx.ui.notify("No active ticket plan checklist.", "warning");
		if (ctx.mode !== "tui") return ctx.ui.notify("The plan checklist drawer requires TUI mode.", "warning");
		await ctx.ui.custom<void>((tui, theme, _keys, done) => new TodoPanel(tui, theme, refreshed.ticket!.id, refreshed.plan!, () => done()), { overlay: true, overlayOptions: TODO_PANEL_OVERLAY_OPTIONS });
	};
	pi.registerCommand("wf-todos", { description: "Open the active workflow plan checklist", handler: async (_args, ctx) => openTodos(ctx) });
	pi.registerShortcut(TODO_PANEL_SHORTCUT, { description: "Open the active workflow plan checklist", handler: openTodos });

	pi.registerTool({
		name: "set_session_name",
		label: "Set Session Name",
		description: "Set the exact native Pi session name.",
		parameters: Type.Object({ name: Type.String({ minLength: 1 }) }),
		async execute(_id, params) {
			pi.setSessionName(params.name);
			generation += 1;
			return { content: [{ type: "text", text: `Session named: ${params.name}` }], details: { name: params.name } };
		},
	});

	pi.registerTool({
		name: "set_workflow_activity",
		label: "Set Workflow Activity",
		description: "Publish a fixed activity for the active workflow step.",
		parameters: Type.Object({ activityId: StringEnum(ACTIVITY_IDS as [string, ...string[]]) }),
		async execute(_id, params, _signal, _update, ctx) {
			state = setState(pi, ctx, setWorkflowActivity(state, params.activityId));
			return { content: [{ type: "text", text: `Workflow activity: ${state.activity!.label}${state.activity!.pass ? ` (pass ${state.activity!.pass})` : ""}.` }], details: { activity: state.activity } };
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
			state = setState(pi, ctx, setWorkflowTicketState(state, ticketId, "tool"));
			if (ticketContext?.id !== ticketId) await selectTicket(ctx, ticketId);
			return {
				content: [{ type: "text", text: `Workflow ticket set to ${ticketId}.` }],
				details: { ticketId },
			};
		},
	});

	pi.registerTool({
		name: "complete_workflow",
		label: "Complete Workflow",
		description: "Mark Commit complete after successful closeout and retain the terminal workflow indicator.",
		promptSnippet: "Complete the active workflow only after successful Commit closeout",
		promptGuidelines: [
			"Use complete_workflow only during commit, after every required repository commit succeeds and tracked feature and plan closeout is complete.",
			"Do not use complete_workflow when commit work failed, is blocked, or still has required closeout work.",
		],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			const ticketId = state.ticketId;
			state = setState(pi, ctx, completeWorkflow(state));
			recoveryPending = false;
			ctx.ui.notify("Workflow completed.", "info");
			return {
				content: [{ type: "text", text: "Workflow completed; the terminal indicator is retained." }],
				details: { ticketId },
			};
		},
	});

	pi.registerTool({
		name: "start_focus",
		label: "Start Focus",
		description: "Enable autonomous focus mode for long-running Execute or standalone work.",
		promptSnippet: "Enable focus mode when the current bounded task should continue autonomously across turns",
		promptGuidelines: [
			"Use start_focus during Execute or outside an active workflow when approved in-scope work is likely to require multiple turns without immediate user input.",
			"Do not use start_focus during planning, review, reflection, or commit, or when a user decision or external dependency is already needed.",
			"Focus does not start or advance workflow steps. Do so only when the user explicitly requests a step.",
		],
		parameters: Type.Object({}),
		async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
			if (state.execution) throw new Error("Focus mode is already active.");
			const scope = focusScope(state);
			if (!scope) throw new Error(`Focus mode cannot start during ${state.activeStep}.`);
			recoveryPending = false;
			const result = transition(state, {
				type: "activate-focus",
				scope,
				ticketId: state.ticketId,
				runId: newRunId(),
			});
			state = setState(pi, ctx, { ...result.state, source: "tool" });
			ctx.ui.notify("Focus mode enabled.", "info");
			const work = scope === "execute" ? "current Execute work" : "current user task";
			return {
				content: [
					{
						type: "text",
						text: `Focus mode is active. Continue the ${work} until it is complete or blocked, then call end_focus.`,
					},
				],
				details: { scope, ticketId: state.ticketId },
			};
		},
	});

	pi.registerTool({
		name: "end_focus",
		label: "End Focus",
		description: "End active focus mode after the work is completed or blocked.",
		promptSnippet: "End focus mode with an outcome and concise summary",
		promptGuidelines: [
			"When focus mode is active, call end_focus only after the requested outcome is complete and verified, or when progress requires user input or an external dependency.",
			"Do not call end_focus merely to report progress while actionable work remains.",
		],
		parameters: Type.Object({
			outcome: StringEnum(["completed", "blocked"] as const),
			summary: Type.String({ minLength: 1, description: "Concise completion summary or blocker explanation" }),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			if (!state.execution) throw new Error("Focus mode is not active.");
			recoveryPending = false;
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
		description: "Run the next workflow skill, or dismiss completed Commit, on double press",
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
				ctx.ui.notify(`Again to ${command ? `run ${command}` : "dismiss workflow indicator"}`, "info");
				return;
			}

			lastAdvanceShortcutAt = 0;
			recoveryPending = false;
			if (!nextStep) {
				state = clearState(pi, ctx);
				ctx.ui.notify("Workflow indicator cleared.", "info");
				return;
			}

			generation += 1;
			latestUserRequest = command;
			state = setState(pi, ctx, startWorkflowStep(state, nextStep, "shortcut"));
			pi.sendUserMessage(command);
		},
	});

	const processInput = async (text: string, streaming: boolean, ctx: ExtensionContext) => {
		generation += 1;
		latestUserRequest = text;

		const skillName = extractSkill(text);
		if (skillName === FOCUS_SKILL) {
			if (state.execution) {
				ctx.ui.notify("Focus mode is already active.", "warning");
				return { action: "handled" as const };
			}
			const scope = focusScope(state);
			if (!scope) {
				ctx.ui.notify(`Focus mode cannot start during ${state.activeStep}.`, "warning");
				return { action: "handled" as const };
			}
			recoveryPending = false;
			const result = transition(state, {
				type: "activate-focus",
				scope,
				ticketId: extractSkillTicket(text) ?? ticketIdFrom(text),
				runId: newRunId(),
			});
			state = setState(pi, ctx, { ...result.state, source: "input" });
			if (state.ticketId && state.ticketId !== ticketContext?.id) await selectTicket(ctx, state.ticketId);
			else await refreshPlan(ctx);
			ctx.ui.notify("Focus mode enabled.", "info");
			return { action: "continue" as const };
		}

		const stepName = extractStep(text);
		if (stepName) {
			recoveryPending = false;
			const interrupted = state.execution
				? transition(state, { type: "end-focus" })
				: { state, effects: [] as RuntimeEffect[] };
			const selectedTicket = extractSkillTicket(text) ?? state.ticketId;
			state = setState(pi, ctx, startWorkflowStep(setWorkflowTicketState(interrupted.state, selectedTicket, "input"), stepName, "input"));
			if (selectedTicket && selectedTicket !== ticketContext?.id) await selectTicket(ctx, selectedTicket);
			else if (!selectedTicket && !pi.getSessionName()) void generateName(ctx, normalizeText(text, 1_500) ?? "", false);
			await refreshPlan(ctx);
			applyEffects(pi, ctx, () => state, interrupted.effects, continuationQueue);
			return { action: "continue" as const };
		}

		if (!pi.getSessionName() && !ticketContext) void generateName(ctx, normalizeText(text, 1_500) ?? "", false);

		if (state.execution) {
			const recovery = recoverFocus(recoveryPending, {
				type: "ordinary-input",
				streaming,
			});
			recoveryPending = recovery.pending;
			const result = transition(state, { type: "ordinary-input" });
			state = setState(pi, ctx, result.state);
			applyEffects(pi, ctx, () => state, result.effects, continuationQueue);
		}
		return { action: "continue" as const };
	};

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") return { action: "continue" };
		const skillName = extractSkill(event.text);
		if (event.streamingBehavior && skillName !== undefined && (isStepName(skillName) || skillName === FOCUS_SKILL)) {
			if (skillName === FOCUS_SKILL) {
				if (state.execution) {
					ctx.ui.notify("Focus mode is already active.", "warning");
					return { action: "handled" };
				}
				if (!focusScope(state)) {
					ctx.ui.notify(`Focus mode cannot start during ${state.activeStep}.`, "warning");
					return { action: "handled" };
				}
				if (deferredWorkflowInputs.length > 0) {
					ctx.ui.notify("Focus mode cannot be queued after another workflow step.", "warning");
					return { action: "handled" };
				}
			}
			deferredWorkflowInputs.push({ name: skillName, ticketId: extractSkillTicket(event.text), text: event.text });
			return { action: "continue" };
		}
		if (!event.streamingBehavior) deferredWorkflowInputs = [];
		return processInput(event.text, event.streamingBehavior !== undefined, ctx);
	});

	pi.on("message_start", async (event, ctx) => {
		const text = userMessageText(event.message);
		const skill = text ? deliveredSkill(text) : undefined;
		if (!skill) return;
		const index = deferredWorkflowInputs.findIndex((item) => item.name === skill.name && item.ticketId === skill.ticketId);
		if (index < 0) return;
		const [input] = deferredWorkflowInputs.splice(index, 1);
		await processInput(input.text, true, ctx);
	});

	pi.on("agent_settled", async () => {
		deferredWorkflowInputs = [];
	});

	pi.on("tool_execution_start", async (event, ctx) => {
		if (event.toolName === "ask_user_question") {
			const attention = questionAttention(event.toolCallId, event.args);
			if (attention) {
				currentAttention = attention;
				publishContext(attention);
			}
			if (state.activeStep === "plan-md") state = setState(pi, ctx, setWorkflowActivity(state, "clarifying-requirements"));
			return;
		}
		if (event.toolName !== "tmux_subagent") return;
		const args = event.args as { action?: unknown; agent?: unknown } | undefined;
		if (!args || args.action !== undefined) return;
		const activity = state.activeStep === "plan-md" && args.agent === "plan-critic" ? "reviewing-plan"
			: state.activeStep === "review" && args.agent === "code-critic" ? "reviewing-implementation"
			: state.activeStep === "reflect" && args.agent === "docs-critic" ? "reviewing-guidance"
			: undefined;
		if (activity) state = setState(pi, ctx, setWorkflowActivity(state, activity));
	});

	pi.on("tool_execution_end", async (event, ctx) => {
		if (event.toolName === "ask_user_question") {
			const requestId = stableRequestId(event.toolCallId);
			if (requestId && currentAttention?.kind === "question" && currentAttention.requestId === requestId) {
				currentAttention = undefined;
				publishContext();
			}
		}
		if (state.activeStep && ticketContext?.planFile) await refreshPlan(ctx);
	});

	pi.on("agent_end", async (event, ctx) => {
		const requestGeneration = generation;
		const stopReason = finalAssistantStopReason(event.messages);
		const assistant = [...event.messages].reverse().find((message) => message.role === "assistant") as { content?: string | Array<{ type?: string; text?: string }> } | undefined;
		const assistantText = typeof assistant?.content === "string" ? assistant.content : assistant?.content?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n");
		const input = attentionInput(latestUserRequest, assistantText, ticketContext, state.activity?.label);
		await refreshPlan(ctx);
		if (requestGeneration !== generation) return;
		if (state.execution) {
			const result = transition(state, { type: "agent-end", stopReason });
			if (result.effects.length) {
				state = setState(pi, ctx, result.state);
				applyEffects(pi, ctx, () => state, result.effects, continuationQueue);
				return;
			}
		}
		if (attentionGenerationDone === requestGeneration || stopReason !== "stop" || !input) return;
		attentionGenerationDone = requestGeneration;
		void (async () => {
			const accepted = await callMetadata(ctx, "attention", ATTENTION_PROMPT, input, 128, parseAttention);
			if (requestGeneration !== generation) return;
			if (accepted) {
				currentAttention = accepted;
				publishContext(accepted);
			}
		})();
	});

	pi.on("before_agent_start", async (event) => {
		if (currentAttention) { currentAttention = undefined; publishContext(); }
		if (state.execution) {
			const recovery = recoverFocus(recoveryPending, { type: "before-agent-start" });
			recoveryPending = recovery.pending;
			if (recovery.delivery === "before-agent-start") {
				return { message: focusMessage(state, "recovery", false) };
			}
			return;
		}

		recoveryPending = false;
		if (!state.ticketId) return;
		return { systemPrompt: `${event.systemPrompt}\n\nActive workflow ticket: ${state.ticketId}` };
	});

	pi.on("session_compact", async (event, ctx) => {
		if (state.execution) {
			const recovery = recoverFocus(recoveryPending, {
				type: "session-compact",
				willRetry: event.willRetry,
			});
			recoveryPending = recovery.pending;
			if (recovery.delivery === "steer") emitRecovery(pi, state);
		}
		const result = transition(state, { type: "session-compact", reason: event.reason });
		state = result.state;
		applyWidget(ctx, state, metadataStatus);
		applyPlanWidget(ctx, state.plan);
	});

	pi.on("session_start", async (event, ctx) => {
		generation += 1;
		metadataRequest += 1;
		settledMetadataRequest = metadataRequest;
		modelCall.reset?.();
		metadataStatus = { state: "ready" };
		settledMetadataStatus = metadataStatus;
		lastMetadataWarning = undefined;
		if (ctx.hasUI) ctx.ui.setStatus(METADATA_STATUS_ID, undefined);
		applyMetadataStatus(ctx);
		recoveryPending = false;
		deferredWorkflowInputs = [];
		const branch = ctx.sessionManager.getBranch();
		const restoredContext = event.reason === "new" || event.reason === "fork" ? undefined : findLatestContext(branch);
		const restoredRequestQuestion = restoredContext?.attention?.kind === "question" && restoredContext.attention.requestId !== undefined;
		currentAttention = restoredRequestQuestion ? undefined : restoredContext?.attention;
		if (restoredRequestQuestion) pi.appendEntry(CONTEXT_ENTRY_TYPE, contextSnapshot(restoredContext?.ticket));
		const restored = event.reason === "new" ? { state: {} } : findLatestState(branch);
		const result = transition(restored.state, { type: "session-boundary", reason: event.reason });
		const normalizeDefinition = shouldNormalizeWorkflowDefinition(
			{ ...restored.state, steps: restored.steps },
			event.reason,
		);
		if (event.reason === "new" || event.reason === "fork") {
			automaticNamingStarted = false;
			ticketContext = undefined;
			if (event.reason === "fork") publishContext();
		}
		if (event.reason === "fork" || result.effects.length || normalizeDefinition) {
			state = setState(pi, ctx, result.state);
			applyEffects(pi, ctx, () => state, result.effects, continuationQueue);
		} else {
			state = result.state;
			applyWidget(ctx, state, metadataStatus);
			applyPlanWidget(ctx, state.plan);
		}
		if (event.reason !== "new" && event.reason !== "fork") {
			const ticketId = state.ticketId ?? restoredContext?.ticket?.id;
			if (ticketId) await selectTicket(ctx, ticketId, false, currentAttention);
			else if (currentAttention) publishContext(currentAttention);
		}
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		generation += 1;
		metadataRequest += 1;
		recoveryPending = false;
		deferredWorkflowInputs = [];
		if (ctx.hasUI) {
			ctx.ui.setStatus(METADATA_STATUS_ID, undefined);
			ctx.ui.setWidget(ENTRY_TYPE, undefined);
		}
		syncFocusPulse(false);
		activeTui = undefined;
	});
}
