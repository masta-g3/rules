import { keyHint, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import type { TUI } from "@earendil-works/pi-tui";
import { Box, Spacer, Text, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { basename } from "node:path";
import { Type } from "typebox";
import {
	completeWorkflow,
	continuationContent,
	createContinuationQueue,
	finalAssistantStopReason,
	FOCUS_MODE_DISPLAY,
	focusScope,
	MAX_ORCHESTRATION_GATES,
	MAX_ORCHESTRATION_NOTE,
	MAX_ORCHESTRATION_TICKETS,
	ORCHESTRATION_STATES,
	orchestrationLens,
	parkedAttention,
	positionalMarker,
	setOrchestration,
	recoverFocus,
	setWorkflowActivity,
	restoreReachedDone,
	MAX_STEP_ITEM_TEXT,
	MAX_STEP_ITEMS,
	STEP_ITEM_STATES,
	setWorkflowTicketState,
	shouldNormalizeWorkflowDefinition,
	startWorkflowStep,
	transition,
	unlinkWorkflowTicketState,
	withWorkflowDefinition,
	WORKFLOW_ACTIVITIES,
	WORKFLOW_DEFINITION,
	type RuntimeEffect,
	type StepName,
	type WorkflowState,
} from "./core.ts";
import {
	CONTEXT_ENTRY_TYPE,
	NAMING_PROMPT,
	PROGRESS_PROMPT,
	contextSnapshot,
	effectiveProjectCwd,
	handOffAttention,
	normalizeText,
	parseContextSnapshot,
	parseProgressNote,
	questionAttention,
	readTicketContext,
	recentTranscript,
	sanitizeSessionName,
	stableRequestId,
	ticketNamingInput,
	type PiAgentHubContextV1,
	type ProgressNote,
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
import { baselines, closeoutKinds, mergeCommits, newCommits, runsGitCommit, workspaceRepos, type RepoBaseline, type WorkspaceRepo } from "./commit-facts.ts";
import { readWorkflowPlan } from "./workflow-plan.ts";
import { brokenWorktreeSnapshot, clearedWorktreeSnapshot, projectWorktreeSnapshot, readWorktreeBinding, type WorktreeLifecycleSnapshot } from "./worktree-context.ts";
import { TodoPanel, TODO_PANEL_OVERLAY_OPTIONS, TODO_PANEL_SHORTCUT } from "./todo-panel.ts";

const ENTRY_TYPE = "workflow-runtime";
const EVENT_TYPE = "workflow-runtime-event";
const RESET_ENTRY_TYPE = "workflow-runtime-reset";
const FORK_COMPACT_ENV = "PI_AGENT_HUB_FORK_COMPACT";
const RESET_CAPABILITY = Symbol.for("pi-agent-hub.workflow-reset.v1");
const FORK_COMPACT_ATTEMPT = /^[A-Za-z0-9_-]{16,80}$/;
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
	data?: WorkflowState & { steps?: unknown; activeMode?: unknown; lens?: unknown; heldStep?: StepName };
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
	state: "disabled" | "ready" | "working" | "success" | "failure";
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
			// Derived display fields are recomputed at publish, never restored.
			const { steps, activeMode: _activeMode, lens: _lens, heldStep, ...state } = entry.data;
			return { state: heldStep ? { ...state, activeStep: heldStep } : state, steps };
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
	if (metadata.state === "disabled") return theme.fg("dim", "◇– meta");
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

type MetadataOperation = "session name" | "progress note";
type MetadataStatus = MetadataIndicatorState & {
	operation?: MetadataOperation;
	result?: MetadataCallResult;
	parsedResult?: string;
};

const METADATA_STATUS_ID = "session-metadata";
const MAX_REJECTED_METADATA = 320;

function rejectedMetadataText(raw: string | undefined): string {
	const text = normalizeText(raw, MAX_REJECTED_METADATA + 1);
	if (!text) return "(empty response)";
	const characters = [...text];
	return characters.length > MAX_REJECTED_METADATA
		? `${characters.slice(0, MAX_REJECTED_METADATA).join("")}…`
		: text;
}

function metadataParseContract(operation?: MetadataOperation): string {
	return operation === "progress note"
		? "a JSON object with a non-empty done or next sentence"
		: "1–3 words, at most 32 characters, using letters and numbers only";
}

function metadataFailureNotice(kind: MetadataFailureKind | "parse"): string {
	if (kind === "authentication") return "Session metadata authentication failed. Run /login openai-codex.";
	if (kind === "unsupported") return "Session metadata unavailable. The configured model is unsupported for this account.";
	if (kind === "timeout") return "Session metadata request timed out. The extension remains active.";
	if (kind === "parse") return "Session metadata returned an invalid result. Run /session-metadata-status for details.";
	return "Session metadata request failed. Run /session-metadata-status for details.";
}

function metadataStatusReport(status: MetadataStatus): string {
	if (status.state === "disabled") return "Session metadata extension: disabled\nSession naming and progress model calls are off for this session.";
	if (status.state === "ready") return "Session metadata extension: active\nNo metadata request has run in this session.";
	if (status.state === "working") return `Session metadata: generating ${status.operation ?? "metadata"}`;
	const result = status.result;
	const lines = [
		`Session metadata: ${status.state === "success" ? "success" : `${status.failureKind ?? "unknown"} failure`}`,
		status.operation ? `Operation: ${status.operation}` : undefined,
		result?.model ? `Model: ${result.model}` : undefined,
		result ? `Latency: ${result.latencyMs} ms` : undefined,
		status.parsedResult ? `Parsed result: ${status.parsedResult}` : undefined,
		status.failureKind === "parse" ? `Reason: The model response did not match the ${status.operation ?? "metadata"} contract.` : undefined,
		status.failureKind === "parse" ? `Expected: ${metadataParseContract(status.operation)}` : undefined,
		status.failureKind === "parse" ? `Received: ${rejectedMetadataText(result?.text)}` : undefined,
		status.failureKind === "parse" ? "Action: No user action is required. Retry the operation; persistent failures need a prompt or parser fix." : undefined,
		result?.failure?.message ? `Error: ${result.failure.message}` : undefined,
		result?.attempts.length ? `Attempts: ${result.attempts.map((attempt) => `${attempt.model} ${attempt.failure?.kind ?? attempt.outcome} (${attempt.latencyMs} ms)`).join(", ")}` : undefined,
		result?.skippedModels.length ? `Skipped: ${result.skippedModels.join(", ")}` : undefined,
	];
	return lines.filter((line): line is string => Boolean(line)).join("\n");
}

export default function workflowRuntime(
	pi: ExtensionAPI,
	dependencies: { modelCall?: SessionModelCall; readBinding?: typeof readWorktreeBinding } = {},
): void {
	const modelCall = dependencies.modelCall ?? createSessionModelCall();
	const readBinding = dependencies.readBinding ?? readWorktreeBinding;
	const rawForkCompactAttempt = process.env[FORK_COMPACT_ENV];
	const forkCompactAttempt = rawForkCompactAttempt && FORK_COMPACT_ATTEMPT.test(rawForkCompactAttempt)
		? rawForkCompactAttempt
		: undefined;
	const capability = { version: 1 as const };
	const capabilities = globalThis as typeof globalThis & Record<PropertyKey, unknown>;
	capabilities[RESET_CAPABILITY] = capability;
	let forkCompactHandled = false;
	let state: WorkflowState = {};
	let ticketContext: TicketContext | undefined;
	let ticketName: string | undefined;
	let worktreeLifecycle: WorktreeLifecycleSnapshot | undefined;
	let lastPublishedContext = "";
	let recoveryPending = false;
	let lastAdvanceShortcutAt = 0;
	let generation = 0;
	let automaticNamingStarted = false;
	let currentAttention: SessionAttention | undefined;
	let currentProgress: ProgressNote | undefined;
	let progressTicketId: string | undefined;
	let progressPending = false;
	let deferredWorkflowInputs: Array<{ name: string; ticketId?: string; text: string }> = [];
	// Commit-step bash calls in flight: their step run, closeout kinds and each workspace repo's HEAD reflog length at start.
	const pendingCommitCalls = new Map<string, { run: number; closeout: Array<"archived" | "ticketDone">; repos?: RepoBaseline[] }>();
	// Changes whenever step facts reset, so late tool completions cannot write into a later step run.
	let factsRun = 0;
	let metadataEnabled = true;
	let metadataStatus: MetadataStatus = { state: "ready" };
	let settledMetadataStatus = metadataStatus;
	let metadataEpoch = 0;
	let metadataRequest = 0;
	let settledMetadataRequest = 0;
	let lastMetadataWarning: MetadataFailureKind | "parse" | undefined;
	const continuationQueue = createContinuationQueue();

	const applyMetadataStatus = (ctx: ExtensionContext) => {
		if (!ctx.hasUI) return;
		applyWidget(ctx, state, metadataStatus);
	};

	const setState = (pi: ExtensionAPI, ctx: ExtensionContext, nextState: WorkflowState): WorkflowState => {
		// A new step run or ticket, or facts that were just cleared, start a new facts run.
		if (nextState.activeStep !== state.activeStep || nextState.ticketId !== state.ticketId || (state.stepFacts && !nextState.stepFacts)) {
			factsRun += 1;
			pendingCommitCalls.clear();
		}
		const updated = { ...nextState, updatedAt: Date.now() };
		persistState(pi, updated);
		applyWidget(ctx, updated, metadataStatus);
		applyPlanWidget(ctx, updated.plan);
		return updated;
	};

	// Dismissing the rail keeps the orchestration snapshot; only /wf-clear or an empty set_orchestration clears it.
	const clearWorkflowRail = (pi: ExtensionAPI, ctx: ExtensionContext): WorkflowState => setState(pi, ctx, state.orchestration ? { orchestration: state.orchestration } : {});

	// Every step start, even of the same step, begins a new facts run that drops calls still in flight.
	const startStep = (base: WorkflowState, step: StepName, source: Parameters<typeof startWorkflowStep>[2]): WorkflowState => {
		factsRun += 1;
		pendingCommitCalls.clear();
		return startWorkflowStep(base, step, source);
	};

	const clearTaskState = (
		ctx: ExtensionContext,
		mode: "ticket" | "full",
		baseState: WorkflowState = state,
	): WorkflowState => {
		generation += 1;
		metadataEpoch += 1;
		metadataRequest += 1;
		settledMetadataRequest = metadataRequest;
		metadataStatus = metadataEnabled ? { state: "ready" } : { state: "disabled" };
		settledMetadataStatus = metadataStatus;
		lastMetadataWarning = undefined;
		recoveryPending = false;
		deferredWorkflowInputs = [];
		currentProgress = undefined;
		automaticNamingStarted = false;
		lastAdvanceShortcutAt = 0;
		ticketContext = undefined;
		ticketName = undefined;
		const stopped = baseState.execution ? transition(baseState, { type: "end-focus" }).state : baseState;
		const nextState = mode === "ticket" ? unlinkWorkflowTicketState(stopped, "command") : {};
		currentAttention = parkedAttention(nextState.orchestration);
		if (mode === "full" && worktreeLifecycle && !worktreeLifecycle.cleared) {
			worktreeLifecycle = clearedWorktreeSnapshot(worktreeLifecycle);
			publishContext(currentAttention);
		} else publishContext(currentAttention);
		state = setState(pi, ctx, nextState);
		return state;
	};

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
		if (!metadataEnabled) return undefined;
		const requestGeneration = generation;
		const requestEpoch = metadataEpoch;
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
		if (!metadataEnabled || requestEpoch !== metadataEpoch) return undefined;
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
		const snapshot = contextSnapshot(ticketContext, attention, Date.now(), worktreeLifecycle, currentProgress);
		const comparable = JSON.stringify({ ...snapshot, updatedAt: 0 });
		if (comparable === lastPublishedContext) return;
		lastPublishedContext = comparable;
		pi.appendEntry(CONTEXT_ENTRY_TYPE, snapshot);
	};

	type BindingRead = { root?: string; snapshot?: WorktreeLifecycleSnapshot; clear?: true; broken?: true };
	const readAuthoritativeBinding = async (ctx: ExtensionContext, ticketId: string): Promise<BindingRead> => {
		if (!state.worktreeRecord) return { root: effectiveProjectCwd(ctx.cwd), clear: true };
		const binding = await readBinding(state.worktreeRecord, ticketId);
		return binding ? { root: binding.authoredRoot, snapshot: binding.snapshot } : { broken: true };
	};

	const applyBindingRead = (read: BindingRead, issue?: string) => {
		let next = worktreeLifecycle;
		if (read.clear && next && !next.cleared) next = clearedWorktreeSnapshot(next);
		else if ((read.broken || issue) && (read.snapshot ?? next)) {
			const base = read.snapshot && next?.recordId === read.snapshot.recordId && next.revision >= read.snapshot.revision ? next : (read.snapshot ?? next!);
			next = brokenWorktreeSnapshot(base, issue);
		}
		else if (read.snapshot) next = projectWorktreeSnapshot(read.snapshot, next);
		if (JSON.stringify(next) !== JSON.stringify(worktreeLifecycle)) {
			worktreeLifecycle = next;
			publishContext(currentAttention);
		}
	};

	const refreshPlan = async (ctx: ExtensionContext) => {
		const requestGeneration = generation;
		const requestedTicketId = state.ticketId;
		const requestedBinding = state.worktreeRecord;
		const bindingRead = requestedTicketId ? await readAuthoritativeBinding(ctx, requestedTicketId) : {};
		if (requestGeneration !== generation || requestedTicketId !== state.ticketId || requestedBinding !== state.worktreeRecord) return undefined;
		const root = bindingRead.root;
		const requestedTicket = root && requestedTicketId ? await readTicketContext(root, requestedTicketId) : undefined;
		const result = requestedTicket?.planFile && root ? await readWorkflowPlan(root, requestedTicket.planFile) : {};
		if (requestGeneration !== generation || requestedTicketId !== state.ticketId || requestedBinding !== state.worktreeRecord) return undefined;
		const bindingIssue = requestedBinding && !bindingRead.broken
			? !requestedTicket ? "Bound authored root does not contain the workflow ticket"
				: !requestedTicket.planFile || !result.found ? "Bound workflow ticket plan is missing or invalid" : undefined
			: undefined;
		applyBindingRead(bindingRead, bindingIssue);
		const freshTicket = requestedTicket ?? (requestedTicketId ? { id: requestedTicketId } : undefined);
		if (JSON.stringify(freshTicket) !== JSON.stringify(ticketContext)) {
			if (freshTicket?.id !== progressTicketId) currentProgress = undefined;
			ticketContext = freshTicket;
			publishContext(currentAttention);
		}
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
		const requestedBinding = state.worktreeRecord;
		const bindingRead = await readAuthoritativeBinding(ctx, ticketId);
		const selectedTicket = bindingRead.root ? await readTicketContext(bindingRead.root, ticketId) : undefined;
		if (requestGeneration !== generation || requestedBinding !== state.worktreeRecord) return false;
		applyBindingRead(bindingRead, requestedBinding && !bindingRead.broken && !selectedTicket ? "Bound authored root does not contain the workflow ticket" : undefined);
		const selected = selectedTicket ?? { id: ticketId };
		const previousTicketName = ticketContext?.id === ticketId ? ticketName : undefined;
		if (progressTicketId !== ticketId) currentProgress = undefined;
		ticketContext = selected;
		ticketName = selected.title ?? previousTicketName ?? (!rename ? pi.getSessionName() : undefined);
		currentAttention = attention ?? parkedAttention(state.orchestration);
		publishContext(currentAttention);
		let nameApplied = false;
		if (awaitGeneratedName && !selected.title) {
			if (metadataEnabled) {
				const source = ticketNamingInput(ticketContext, recentTranscript(ctx.sessionManager.getBranch() as TranscriptEntry[]));
				const initialName = pi.getSessionName();
				const title = await callMetadata(ctx, "session name", NAMING_PROMPT, source, 64, sanitizeSessionName);
				if (title && requestGeneration === generation && pi.getSessionName() === initialName) {
					ticketName = title;
					pi.setSessionName(title);
					nameApplied = true;
				}
			}
			await refreshPlan(ctx);
			return nameApplied;
		}
		if (ticketName) {
			if (pi.getSessionName() !== ticketName) pi.setSessionName(ticketName);
			nameApplied = true;
		} else if (rename) {
			ticketName = ticketId;
			pi.setSessionName(ticketName);
			const source = ticketNamingInput(ticketContext, recentTranscript(ctx.sessionManager.getBranch() as TranscriptEntry[]));
			const initialName = pi.getSessionName();
			const applyGeneratedName = async () => {
				const title = await callMetadata(ctx, "session name", NAMING_PROMPT, source, 64, sanitizeSessionName);
				if (requestGeneration !== generation || pi.getSessionName() !== initialName) return false;
				ticketName = title ?? ticketId;
				pi.setSessionName(ticketName);
				return true;
			};
			void applyGeneratedName();
		}
		await refreshPlan(ctx);
		return nameApplied;
	};

	const generateName = async (ctx: ExtensionContext, source: string, explicit: boolean) => {
		if (!metadataEnabled || !source || (!explicit && automaticNamingStarted)) return false;
		if (!explicit) automaticNamingStarted = true;
		const requestGeneration = explicit ? ++generation : generation;
		const initialName = pi.getSessionName();
		const name = await callMetadata(ctx, "session name", NAMING_PROMPT, source, 64, sanitizeSessionName);
		if (!name || requestGeneration !== generation || pi.getSessionName() !== initialName) return false;
		if (explicit) { ticketContext = undefined; ticketName = undefined; currentProgress = undefined; publishContext(); }
		pi.setSessionName(name);
		return true;
	};

	const noteProgress = async (ctx: ExtensionContext) => {
		if (!metadataEnabled || progressPending || process.env.PI_TMUX_SUBAGENTS_JOB_ID) return;
		const transcript = recentTranscript(ctx.sessionManager.getBranch() as TranscriptEntry[]);
		const input = ticketContext ? ticketNamingInput(ticketContext, transcript) : transcript;
		if (!input) return;
		const requestGeneration = generation;
		const ticketId = ticketContext?.id;
		progressPending = true;
		try {
			const note = await callMetadata(ctx, "progress note", PROGRESS_PROMPT, input, 128, parseProgressNote);
			if (!note || requestGeneration !== generation) return;
			currentProgress = { ...note, updatedAt: Date.now() };
			progressTicketId = ticketId;
			publishContext(currentAttention);
		} finally {
			progressPending = false;
		}
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
		description: "Set or clear the active workflow ticket",
		handler: async (args, ctx) => {
			const rawArg = (args ?? "").trim();
			if (rawArg === "clear") {
				clearTaskState(ctx, "ticket");
				ctx.ui.notify("Workflow ticket cleared. Workflow progress is retained.", "info");
				return;
			}
			const [ticketArg, recordPath, ...extra] = rawArg.split(/\s+/u);
			const ticketId = parseTicketArg(ticketArg ?? "");
			if (!ticketId || extra.length) {
				ctx.ui.notify("Usage: /wf-ticket <ticket-id> [absolute-worktree-record] | clear", "warning");
				return;
			}
			if (recordPath) {
				const validationGeneration = generation;
				const priorBinding = state.worktreeRecord;
				const priorTicket = state.ticketId;
				const binding = await readBinding(recordPath, ticketId);
				if (validationGeneration !== generation || priorBinding !== state.worktreeRecord || priorTicket !== state.ticketId) {
					ctx.ui.notify("Workflow changed while the worktree binding was being validated; the binding was not applied.", "warning");
					return;
				}
				if (!binding) {
					ctx.ui.notify("The worktree record is missing, invalid, or belongs to another ticket.", "warning");
					return;
				}
			}
			state = setState(pi, ctx, { ...setWorkflowTicketState(state, ticketId, "command"), ...(recordPath ? { worktreeRecord: recordPath } : {}) });
			if (recordPath || ticketContext?.id !== ticketId) await selectTicket(ctx, ticketId);
			ctx.ui.notify(`Workflow ticket set to ${ticketId}.`, "info");
		},
	});

	pi.registerCommand("wf-clear", {
		description: "Clear the workflow and unlink its ticket",
		handler: async (_args, ctx) => {
			clearTaskState(ctx, "full");
			ctx.ui.notify("Workflow and ticket cleared.", "info");
		},
	});

	pi.registerCommand("session-metadata-disable", {
		description: "Disable session naming and progress model calls",
		handler: async (_args, ctx) => {
			if (!metadataEnabled) return ctx.ui.notify("Session metadata is already disabled.", "info");
			metadataEnabled = false;
			metadataEpoch += 1;
			metadataRequest += 1;
			settledMetadataRequest = metadataRequest;
			metadataStatus = { state: "disabled" };
			settledMetadataStatus = metadataStatus;
			applyMetadataStatus(ctx);
			ctx.ui.notify("Session metadata disabled for this session.", "info");
		},
	});

	pi.registerCommand("session-metadata-enable", {
		description: "Enable session naming and progress model calls",
		handler: async (_args, ctx) => {
			if (metadataEnabled) return ctx.ui.notify("Session metadata is already enabled.", "info");
			metadataEnabled = true;
			metadataStatus = { state: "ready" };
			settledMetadataStatus = metadataStatus;
			applyMetadataStatus(ctx);
			ctx.ui.notify("Session metadata enabled for this session.", "info");
		},
	});

	pi.registerCommand("session-metadata-status", {
		description: "Show the latest session metadata model attempt",
		handler: async (_args, ctx) => ctx.ui.notify(metadataStatusReport(metadataStatus), "info"),
	});

	pi.registerCommand("session-name-refresh", {
		description: "Refresh the native Pi session name",
		handler: async (_args, ctx) => {
			if (ticketContext) {
				const ticketId = ticketContext.id;
				const ok = await selectTicket(ctx, ticketId, true, currentAttention, true);
				const source = ticketContext?.title ? `from ${ticketId}` : `using ${ticketId} context`;
				return ctx.ui.notify(ok ? `Session renamed to “${pi.getSessionName()}” ${source}.` : "Could not refresh the session name.", ok ? "info" : "warning");
			}
			if (!metadataEnabled) return ctx.ui.notify("Session metadata is disabled. Run /session-metadata-enable first.", "warning");
			const ok = await generateName(ctx, recentTranscript(ctx.sessionManager.getBranch() as TranscriptEntry[]), true);
			ctx.ui.notify(ok ? `Session renamed to “${pi.getSessionName()}”.` : "Could not refresh the session name.", ok ? "info" : "warning");
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
		description: "Set the exact native Pi session name. Linked sessions keep their ticket title; run /wf-ticket clear before renaming.",
		promptSnippet: "Rename the Pi session when its task changes",
		promptGuidelines: [
			"The runtime names unnamed sessions from the first request. Call set_session_name when the user asks, when that request was too vague to name the task, or when the task clearly changes, including after a fork or ticket clear. Use 1–3 concrete words in Title Case.",
			"Do not call set_session_name while a ticket is linked, and do not clear a ticket just to rename.",
		],
		parameters: Type.Object({ name: Type.String({ minLength: 1 }) }),
		async execute(_id, params) {
			if (ticketContext && params.name !== ticketName) {
				throw new Error(`Session is linked to ${ticketContext.id} and keeps its ticket title. Run /wf-ticket clear before renaming.`);
			}
			pi.setSessionName(params.name);
			generation += 1;
			return { content: [{ type: "text", text: `Session named: ${params.name}` }], details: { name: params.name } };
		},
	});

	pi.registerTool({
		name: "set_workflow_step",
		label: "Set Workflow Step",
		description: "Set the active workflow step and indicator without invoking its skill. Allows direct and backward changes; the current step is a no-op.",
		promptSnippet: "Set the workflow indicator before starting an authorized step",
		promptGuidelines: [
			"Use set_workflow_step before starting a user-authorized workflow step, including explicitly requested chains. Read and follow that step's skill; reading it alone does not update the indicator.",
			"set_workflow_step does not authorize additional work. Do not advance from handoff labels alone. Await the step change before publishing its activities.",
		],
		parameters: Type.Object({ stepId: StringEnum(WORKFLOW_DEFINITION.map((step) => step.id)) }),
		async execute(_id, params, _signal, _update, ctx) {
			if (state.activeStep !== params.stepId) {
				generation += 1;
				recoveryPending = false;
				const interrupted = state.execution
					? transition(state, { type: "end-focus" })
					: { state, effects: [] as RuntimeEffect[] };
				state = setState(pi, ctx, startStep(interrupted.state, params.stepId, "tool"));
				await refreshPlan(ctx);
				applyEffects(pi, ctx, () => state, interrupted.effects, continuationQueue);
			}
			return { content: [{ type: "text", text: `Workflow step: ${params.stepId}.` }], details: { stepId: params.stepId } };
		},
	});

	pi.registerTool({
		name: "set_workflow_activity",
		label: "Set Workflow Activity",
		description: "Publish a fixed activity for the active workflow step.",
		parameters: Type.Object({
			activityId: StringEnum(ACTIVITY_IDS as [string, ...string[]]),
			items: Type.Optional(Type.Array(Type.Object({
				text: Type.String({ minLength: 1, maxLength: MAX_STEP_ITEM_TEXT, description: "Short title of one finding or candidate" }),
				state: StringEnum(STEP_ITEM_STATES),
			}), { maxItems: MAX_STEP_ITEMS, description: "Review findings or Reflect candidates with their state; replaces the step's list. Review and Reflect only." })),
		}),
		async execute(_id, params, _signal, _update, ctx) {
			state = setState(pi, ctx, setWorkflowActivity(state, params.activityId, params.items));
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
			worktreeRecord: Type.Optional(Type.String({ description: "Exact absolute Rules worktree.json path" })),
		}),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const ticketId = parseTicketArg(params.ticketId);
			if (!ticketId) throw new Error("Invalid ticket id. Use format like engine-003.");
			if (params.worktreeRecord) {
				const validationGeneration = generation;
				const priorBinding = state.worktreeRecord;
				const priorTicket = state.ticketId;
				const binding = await readBinding(params.worktreeRecord, ticketId);
				if (validationGeneration !== generation || priorBinding !== state.worktreeRecord || priorTicket !== state.ticketId) throw new Error("Workflow changed while the worktree binding was being validated; the binding was not applied.");
				if (!binding) throw new Error("The worktree record is missing, invalid, or belongs to another ticket.");
			}
			state = setState(pi, ctx, { ...setWorkflowTicketState(state, ticketId, "tool"), ...(params.worktreeRecord ? { worktreeRecord: params.worktreeRecord } : {}) });
			if (params.worktreeRecord || ticketContext?.id !== ticketId) await selectTicket(ctx, ticketId);
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

	pi.registerTool({
		name: "hand_off",
		label: "Hand Off",
		description: "Tell the user that work is ready for review or blocked, with an optional recommendation and evidence.",
		promptSnippet: "Hand finished or blocked work back to the user",
		promptGuidelines: [
			"Call hand_off as the final action of a turn that hands work back: kind ready when a requested outcome is ready for review, kind blocked when you cannot continue without the user or an external dependency.",
			"Do not call hand_off for progress updates or ordinary answers. Use ask_user_question for questions.",
			"Set recommendation to the next action you advise. Set artifact to an existing file or URL that holds the evidence, such as a plan, validation notes, or a pull request.",
		],
		parameters: Type.Object({
			kind: StringEnum(["ready", "blocked"] as const),
			text: Type.String({ minLength: 1, description: "What is ready or what blocks progress" }),
			recommendation: Type.Optional(Type.String({ minLength: 1, description: "The next action you advise" })),
			artifact: Type.Optional(Type.String({ minLength: 1, description: "Existing file path or URL holding the evidence" })),
		}),
		async execute(toolCallId, params, _signal, _onUpdate, ctx) {
			const attention = await handOffAttention(toolCallId, params, ctx.cwd);
			// A continuation turn would clear the handoff, so a handoff ends focus.
			if (state.execution) {
				recoveryPending = false;
				state = setState(pi, ctx, transition(state, { type: "end-focus" }).state);
				ctx.ui.notify(`Focus mode ended: ${params.kind === "ready" ? "completed" : "blocked"}.`, "info");
			}
			if (params.kind === "ready") {
				const restored = restoreReachedDone(state);
				if (restored !== state) state = setState(pi, ctx, restored);
			}
			currentAttention = attention;
			publishContext(attention);
			return {
				content: [{ type: "text", text: `Handoff published (${params.kind}). Give the user a final response now.` }],
				details: attention,
			};
		},
	});

	pi.registerTool({
		name: "set_orchestration",
		label: "Set Orchestration",
		description: "Publish the orchestrator's run as the session card lens: what it is doing and each ticket's state, step, accepted gates, parked question and commit. Each call replaces the whole snapshot; an empty ticket list clears it.",
		promptSnippet: "Publish the orchestrated tickets' states on the session card",
		promptGuidelines: [
			"Call set_orchestration only while orchestrating ticket subagents: at kickoff and after each gate, launch, park, and merge. Send every ticket each time.",
			"Set gates to the number of phase gates you accepted for that ticket. A parked ticket's note is its question; it raises a blocked request until the ticket leaves parked.",
		],
		parameters: Type.Object({
			doing: Type.Optional(Type.String({ minLength: 1, maxLength: 120, description: "What the orchestrator is doing now" })),
			tickets: Type.Array(Type.Object({
				id: Type.String({ description: "Ticket id like engine-003" }),
				state: StringEnum(ORCHESTRATION_STATES),
				step: Type.Optional(StringEnum(WORKFLOW_DEFINITION.map((step) => step.id))),
				note: Type.Optional(Type.String({ minLength: 1, maxLength: MAX_ORCHESTRATION_NOTE, description: "Parked question or latest gate result" })),
				commit: Type.Optional(Type.String({ description: "Short commit hash once committed" })),
				gates: Type.Optional(Type.Integer({ minimum: 0, maximum: MAX_ORCHESTRATION_GATES, description: "Phase gates you accepted for this ticket" })),
			}), { maxItems: MAX_ORCHESTRATION_TICKETS }),
			pr: Type.Optional(Type.String({ minLength: 1, maxLength: 120, description: "Pull request URL or state" })),
		}),
		async execute(toolCallId, params, _signal, _onUpdate, ctx) {
			const before = parkedAttention(state.orchestration);
			const orchestration = setOrchestration(state.orchestration, params, toolCallId);
			const { orchestration: _previous, ...rest } = state;
			state = setState(pi, ctx, orchestration ? { ...rest, orchestration } : rest);
			// A newer question or handoff keeps priority; the parked request returns once it clears.
			if (!currentAttention || (before && currentAttention.requestId === before.requestId)) {
				currentAttention = parkedAttention(orchestration);
				publishContext(currentAttention);
			}
			const count = orchestration?.tickets.length ?? 0;
			return { content: [{ type: "text", text: count ? `Orchestration published: ${count} ticket${count === 1 ? "" : "s"}.` : "Orchestration cleared." }], details: { orchestration } };
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
				state = clearWorkflowRail(pi, ctx);
				ctx.ui.notify("Workflow indicator cleared.", "info");
				return;
			}

			generation += 1;
			state = setState(pi, ctx, startStep(state, nextStep, "shortcut"));
			pi.sendUserMessage(command);
		},
	});

	const processInput = async (text: string, streaming: boolean, ctx: ExtensionContext) => {
		generation += 1;

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
			state = setState(pi, ctx, startStep(setWorkflowTicketState(interrupted.state, selectedTicket, "input"), stepName, "input"));
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

	// A bound record is authoritative: a broken one records no commits rather than scanning unbound repositories.
	const workspaceRepoPaths = async (ctx: ExtensionContext): Promise<WorkspaceRepo[]> => {
		if (!state.worktreeRecord) return workspaceRepos(ctx.cwd);
		if (!state.ticketId) return [];
		const binding = await readAuthoritativeBinding(ctx, state.ticketId);
		return binding.snapshot?.repositories?.map((repo) => ({ path: repo.worktreePath, label: basename(repo.worktreePath) })) ?? [];
	};

	pi.on("tool_execution_start", async (event, ctx) => {
		if (event.toolName === "ask_user_question") {
			const attention = questionAttention(event.toolCallId, event.args);
			if (attention) {
				currentAttention = attention;
				publishContext(attention);
			}
			// Once orchestration owns the card, the orchestrator's questions must not reopen the held step.
			if (state.activeStep === "plan-md" && !orchestrationLens(state)) {
				const questions = (event.args as { questions?: Array<{ question?: unknown }> } | undefined)?.questions;
				const text = Array.isArray(questions) ? normalizeText(questions[0]?.question, 100) : undefined;
				const requestId = stableRequestId(event.toolCallId);
				const answered = state.stepFacts?.questions?.answered ?? 0;
				const waiting = text && requestId ? { count: questions!.length, text, requestId } : undefined;
				// A question during critic review keeps the critic stage; earlier questions publish clarification.
				const critic = WORKFLOW_ACTIVITIES["plan-md"].some((item) => item.stage === "critic" && item.id === state.activity?.id);
				const base = critic ? state : setWorkflowActivity(state, "clarifying-requirements");
				state = setState(pi, ctx, { ...base, stepFacts: { ...state.stepFacts, questions: { answered, ...(waiting ? { waiting } : {}) } } });
			}
			return;
		}
		if (event.toolName === "bash" && state.activeStep === "commit" && !state.currentStepComplete) {
			const command = (event.args as { command?: unknown } | undefined)?.command;
			if (typeof command !== "string") return;
			const run = factsRun;
			const closeout = closeoutKinds(command);
			// Recorded before the command runs: Pi awaits start handlers before executing the tool.
			const repos = runsGitCommit(command) ? await baselines(await workspaceRepoPaths(ctx)) : undefined;
			if (run === factsRun && (closeout.length || repos)) pendingCommitCalls.set(event.toolCallId, { run, closeout, ...(repos ? { repos } : {}) });
			return;
		}
		if (event.toolName !== "tmux_subagent") return;
		const args = event.args as { action?: unknown; agent?: unknown } | undefined;
		if (!args || args.action !== undefined || orchestrationLens(state)) return;
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
				currentAttention = parkedAttention(state.orchestration);
				publishContext(currentAttention);
			}
			// Only the open call of this Plan run counts; a step change already reset the facts.
			const questions = state.stepFacts?.questions;
			if (requestId && questions?.waiting?.requestId === requestId) {
				const answered = questions.answered + (event.isError ? 0 : questions.waiting.count);
				state = setState(pi, ctx, { ...state, stepFacts: { ...state.stepFacts, questions: { answered } } });
			}
		}
		const pending = pendingCommitCalls.get(event.toolCallId);
		if (pending) {
			pendingCommitCalls.delete(event.toolCallId);
			// Commits are read from each repo's reflog, so one repo's success counts even when the call failed overall.
			const found = pending.repos ? await newCommits(pending.repos) : [];
			// Merge into the state as it is now: parallel calls and step changes may have landed during the read.
			if (pending.run === factsRun) {
				const commits = mergeCommits(state.stepFacts?.commits ?? [], found);
				const closed = event.isError ? [] : pending.closeout;
				const closeout = closed.length ? { ...state.stepFacts?.closeout, ...Object.fromEntries(closed.map((kind) => [kind, true as const])) } : state.stepFacts?.closeout;
				const stepFacts = { ...state.stepFacts, ...(commits.length ? { commits } : {}), ...(closeout ? { closeout } : {}) };
				if (JSON.stringify(stepFacts) !== JSON.stringify(state.stepFacts ?? {})) state = setState(pi, ctx, { ...state, stepFacts });
			}
		}
		if (state.activeStep && (state.worktreeRecord || ticketContext?.planFile)) await refreshPlan(ctx);
	});

	pi.on("agent_end", async (event, ctx) => {
		const requestGeneration = generation;
		const stopReason = finalAssistantStopReason(event.messages);
		await refreshPlan(ctx);
		if (requestGeneration !== generation) return;
		if (state.execution) {
			const result = transition(state, { type: "agent-end", stopReason });
			if (result.effects.length) {
				state = setState(pi, ctx, result.state);
				applyEffects(pi, ctx, () => state, result.effects, continuationQueue);
			}
		}
		if (stopReason !== "aborted") void noteProgress(ctx);
	});

	pi.on("before_agent_start", async (event) => {
		// Ordinary attention ends with the turn; a parked ticket's request stays until the ticket leaves parked.
		const parked = parkedAttention(state.orchestration);
		if (currentAttention !== parked && JSON.stringify(currentAttention) !== JSON.stringify(parked)) { currentAttention = parked; publishContext(currentAttention); }
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

	pi.on("session_info_changed", (_event, ctx) => {
		if (!ticketContext || !ticketName || pi.getSessionName() === ticketName) return;
		pi.setSessionName(ticketName);
		ctx.ui.notify(`Session is linked to ${ticketContext.id} and keeps its ticket title. Run /wf-ticket clear before renaming.`, "warning");
	});

	pi.on("session_start", async (event, ctx) => {
		const compactForkStartup = (rawForkCompactAttempt === "1" || forkCompactAttempt !== undefined) && !forkCompactHandled;
		if (compactForkStartup) forkCompactHandled = true;
		if (rawForkCompactAttempt !== undefined) delete process.env[FORK_COMPACT_ENV];
		generation += 1;
		metadataEnabled = true;
		metadataEpoch += 1;
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
		pendingCommitCalls.clear();
		factsRun += 1;
		const branch = ctx.sessionManager.getBranch();
		const startsEmpty = compactForkStartup || event.reason === "new" || event.reason === "fork";
		const branchContext = findLatestContext(branch);
		const restoredContext = startsEmpty ? undefined : branchContext;
		worktreeLifecycle = compactForkStartup || event.reason === "fork" ? branchContext?.worktree : restoredContext?.worktree;
		currentProgress = restoredContext?.progress;
		progressTicketId = restoredContext?.ticket?.id;
		lastPublishedContext = branchContext ? JSON.stringify({ ...branchContext, updatedAt: 0 }) : "";
		const restoredRequestQuestion = restoredContext?.attention?.kind === "question" && restoredContext.attention.requestId !== undefined;
		currentAttention = restoredRequestQuestion ? undefined : restoredContext?.attention;
		if (restoredRequestQuestion) {
			ticketContext = restoredContext?.ticket;
			publishContext();
		}
		const latest = event.reason === "new" ? { state: {} as WorkflowState } : findLatestState(branch);
		// Like request-backed question attention, an open question cannot survive the process boundary.
		const staleWaiting = latest.state.stepFacts?.questions?.waiting !== undefined;
		const restored = staleWaiting
			? { ...latest, state: { ...latest.state, stepFacts: { ...latest.state.stepFacts, questions: { answered: latest.state.stepFacts!.questions!.answered } } } }
			: latest;
		const boundaryReason = compactForkStartup ? "fork" : event.reason;
		const result = transition(restored.state, { type: "session-boundary", reason: boundaryReason });
		const normalizeDefinition = shouldNormalizeWorkflowDefinition(
			{ ...restored.state, steps: restored.steps },
			boundaryReason,
		);
		if (compactForkStartup || event.reason === "fork") {
			clearTaskState(ctx, "full", restored.state);
			applyEffects(pi, ctx, () => state, result.effects, continuationQueue);
			if (compactForkStartup && forkCompactAttempt) {
				pi.appendEntry(RESET_ENTRY_TYPE, { version: 1, id: forkCompactAttempt, status: "ready" });
			}
			return;
		}
		if (startsEmpty) {
			automaticNamingStarted = false;
			ticketContext = undefined;
			ticketName = undefined;
		}
		if (result.effects.length || normalizeDefinition || staleWaiting) {
			state = setState(pi, ctx, result.state);
			applyEffects(pi, ctx, () => state, result.effects, continuationQueue);
		} else {
			state = result.state;
			applyWidget(ctx, state, metadataStatus);
			applyPlanWidget(ctx, state.plan);
		}
		if (event.reason !== "new" && event.reason !== "fork") {
			currentAttention ??= parkedAttention(state.orchestration);
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
		if (capabilities[RESET_CAPABILITY] === capability) delete capabilities[RESET_CAPABILITY];
	});
}
