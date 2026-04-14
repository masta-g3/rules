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
} as const;

const WORKFLOW = [
	{ id: "next-feature", short: "NX", label: "next-feature" },
	{ id: "prime", short: "PR", label: "prime" },
	{ id: "plan-md", short: "PL", label: "plan-md" },
	{ id: "execute", short: "EX", label: "execute" },
	{ id: "review", short: "RV", label: "review" },
	{ id: "commit", short: "CM", label: "commit" },
] as const;

type StepName = (typeof WORKFLOW)[number]["id"];

type IndicatorState = {
	activeStep?: StepName;
	source?: "input";
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

function renderRail(width: number, state: IndicatorState, theme: ExtensionContext["ui"]["theme"]): string {
	const activeStep = getStep(state.activeStep);
	if (!activeStep) return "";

	const separator = theme.fg(TOKENS.rail, " ─ ");
	const full = WORKFLOW.map((step) => {
		if (step.id === activeStep.id) {
			return theme.bg(TOKENS.activeBg, theme.fg(TOKENS.activeFg, step.short));
		}
		return theme.fg(TOKENS.muted, step.short);
	}).join(separator);

	if (visibleWidth(full) <= width) return full;

	const compact = `${theme.fg(TOKENS.muted, `${getStepIndex(activeStep.id) + 1}/${WORKFLOW.length} `)}${theme.bg(
		TOKENS.activeBg,
		theme.fg(TOKENS.activeFg, activeStep.short),
	)}`;
	return truncateToWidth(compact, width);
}

function applyWidget(ctx: ExtensionContext, state: IndicatorState): void {
	if (!state.activeStep) {
		ctx.ui.setWidget(WIDGET_ID, undefined);
		return;
	}

	ctx.ui.setWidget(WIDGET_ID, (_tui, theme) => ({
		render(width: number): string[] {
			const line = renderRail(width, state, theme);
			return line ? [line] : [];
		},
		invalidate(): void {},
	}));
}

export default function workflowIndicator(pi: ExtensionAPI): void {
	let state: IndicatorState = {};

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") {
			return { action: "continue" };
		}

		const match = event.text.match(SKILL_PREFIX);
		const stepName = match?.[1];
		if (!stepName || !isStepName(stepName)) {
			return { action: "continue" };
		}

		state = {
			activeStep: stepName,
			source: "input",
			updatedAt: Date.now(),
		};
		persistState(pi, state);
		applyWidget(ctx, state);
		return { action: "continue" };
	});

	pi.on("session_start", async (event, ctx) => {
		if (event.reason === "new") {
			state = {};
			applyWidget(ctx, state);
			return;
		}

		if (event.reason === "fork") {
			state = { updatedAt: Date.now() };
			persistState(pi, state);
			applyWidget(ctx, state);
			return;
		}

		state = findLatestState(ctx.sessionManager.getBranch());
		applyWidget(ctx, state);
	});
}
