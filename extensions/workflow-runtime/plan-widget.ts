import type { ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { PlanProjection } from "./workflow-plan.ts";

export const PLAN_WIDGET_KEY = "workflow-plan";

export class PlanWidget implements Component {
	private readonly theme: Theme;
	private readonly plan: PlanProjection;
	constructor(theme: Theme, plan: PlanProjection) {
		this.theme = theme;
		this.plan = plan;
	}
	invalidate(): void {}
	render(width: number): string[] {
		const phase = this.plan.phase ? `Phase ${this.plan.phase.index}/${this.plan.phase.count} · ${this.plan.phase.title}` : "Plan";
		const progress = `✓ ${this.plan.tasks.completed}/${this.plan.tasks.total} tasks${this.plan.nextStep ? ` · Next: ${this.plan.nextStep}` : ""}`;
		if (width < 16) return [truncateToWidth(`${phase} · ${progress}`, width)];
		const contentWidth = Math.max(1, width - 4);
		const rows = [phase, progress].flatMap((line) => wrapTextWithAnsi(line, contentWidth));
		const title = " plan ";
		return [
			this.theme.fg("borderMuted", `╭${title}${"─".repeat(Math.max(1, width - visibleWidth(title) - 2))}╮`),
			...rows.map((line) => `${this.theme.fg("borderMuted", "│ ")}${this.theme.fg("text", line)}${" ".repeat(Math.max(0, contentWidth - visibleWidth(line)))}${this.theme.fg("borderMuted", " │")}`),
			this.theme.fg("borderMuted", `╰${"─".repeat(Math.max(0, width - 2))}╯`),
		];
	}
}

export function applyPlanWidget(ctx: ExtensionContext, plan?: PlanProjection): void {
	if (!ctx.hasUI) return;
	ctx.ui.setWidget(PLAN_WIDGET_KEY, plan ? (_tui, theme) => new PlanWidget(theme, plan) : undefined, { placement: "aboveEditor" });
}
