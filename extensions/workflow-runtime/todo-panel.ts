import type { Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component, type OverlayOptions, type TUI } from "@earendil-works/pi-tui";
import type { WorkflowPlan, PlanTask } from "./workflow-plan.ts";

export const TODO_PANEL_SHORTCUT = Key.ctrlAlt("t");
export const TODO_PANEL_OVERLAY_OPTIONS = { anchor: "right-center", width: 54, minWidth: 36, maxHeight: "80%", margin: { right: 1 } } as const satisfies OverlayOptions;

export class TodoPanel implements Component {
	private offset = 0;
	private rows = 1;
	private readonly tui: TUI;
	private readonly theme: Theme;
	private readonly ticket: string;
	private readonly plan: WorkflowPlan;
	private readonly close: () => void;
	constructor(tui: TUI, theme: Theme, ticket: string, plan: WorkflowPlan, close: () => void) {
		this.tui = tui;
		this.theme = theme;
		this.ticket = ticket;
		this.plan = plan;
		this.close = close;
	}
	invalidate(): void {}
	render(width: number): string[] {
		if (width < 4) return width ? [truncateToWidth("Plan", width)] : [];
		const contentWidth = width - 4;
		const body = this.plan.sections.flatMap((section, sectionIndex) => [
			...wrapTextWithAnsi(section.heading ?? "Tasks", contentWidth).map((line) => this.theme.fg(sectionIndex === this.plan.currentSectionIndex ? "accent" : "muted", this.theme.bold(line))),
			...section.tasks.flatMap((task) => this.taskRows(task, contentWidth)),
		]);
		this.rows = Math.max(1, Math.floor(this.tui.terminal.rows * .8) - 3);
		this.offset = Math.max(0, Math.min(this.offset, Math.max(0, body.length - this.rows)));
		const visible = body.slice(this.offset, this.offset + this.rows);
		const line = (text: string) => { const value = truncateToWidth(text, contentWidth); return `${this.theme.fg("borderMuted", "│ ")}${value}${" ".repeat(Math.max(0, contentWidth - visibleWidth(value)))}${this.theme.fg("borderMuted", " │")}`; };
		const title = truncateToWidth(` Plan · ${this.ticket} `, width - 2);
		return [
			`${this.theme.fg("borderMuted", "╭")}${this.theme.fg("accent", this.theme.bold(title))}${this.theme.fg("borderMuted", `${"─".repeat(Math.max(0, width - visibleWidth(title) - 2))}╮`)}`,
			...visible.map(line),
			line(this.theme.fg("dim", `${this.plan.completed}/${this.plan.total} done · ↑↓ PgUp/PgDn · Esc`)),
			this.theme.fg("borderMuted", `╰${"─".repeat(width - 2)}╯`),
		];
	}
	handleInput(data: string): void {
		if (matchesKey(data, Key.escape) || matchesKey(data, TODO_PANEL_SHORTCUT)) return this.close();
		const old = this.offset;
		if (matchesKey(data, Key.up)) this.offset--; else if (matchesKey(data, Key.down)) this.offset++; else if (matchesKey(data, Key.pageUp)) this.offset -= this.rows; else if (matchesKey(data, Key.pageDown)) this.offset += this.rows; else return;
		this.offset = Math.max(0, this.offset); if (old !== this.offset) this.tui.requestRender();
	}
	private taskRows(task: PlanTask, width: number): string[] {
		return wrapTextWithAnsi(task.text, Math.max(1, width - 2)).map((line, i) => `${i ? " " : this.theme.fg(task.done ? "success" : "dim", task.done ? "☑" : "☐")} ${this.theme.fg(task.done ? "muted" : "text", line)}`);
	}
}
