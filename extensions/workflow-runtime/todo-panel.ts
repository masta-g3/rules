import type { Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi, type Component, type OverlayOptions, type TUI } from "@earendil-works/pi-tui";
import type { WorkflowPlan, PlanTask } from "./workflow-plan.ts";

export const TODO_PANEL_SHORTCUT = Key.ctrlAlt("t");
export const TODO_PANEL_OVERLAY_OPTIONS = { anchor: "right-center", width: 54, minWidth: 36, maxHeight: "80%", margin: { right: 1 } } as const satisfies OverlayOptions;

export class TodoPanel implements Component {
	private offset = 0;
	private positioned = false;
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
		const body: string[] = [];
		let sectionStart = 0;
		let nextTaskStart: number | undefined;
		for (const [sectionIndex, section] of this.plan.sections.entries()) {
			const current = sectionIndex === this.plan.currentSectionIndex;
			if (current) sectionStart = body.length;
			body.push(...wrapTextWithAnsi(section.heading ?? "Tasks", contentWidth).map((line) => this.theme.fg(current ? "accent" : "muted", this.theme.bold(line))));
			for (const task of section.tasks) {
				if (current && !task.done && nextTaskStart === undefined) nextTaskStart = body.length;
				body.push(...this.taskRows(task, contentWidth));
			}
		}
		this.rows = Math.max(1, Math.floor(this.tui.terminal.rows * .8) - 4);
		if (!this.positioned) {
			this.offset = nextTaskStart !== undefined && nextTaskStart >= sectionStart + this.rows ? nextTaskStart : sectionStart;
			this.positioned = true;
		}
		this.offset = Math.max(0, Math.min(this.offset, Math.max(0, body.length - this.rows)));
		const visible = body.slice(this.offset, this.offset + this.rows);
		const line = (text: string) => { const value = truncateToWidth(text, contentWidth); return `${this.theme.fg("borderMuted", "│ ")}${value}${" ".repeat(Math.max(0, contentWidth - visibleWidth(value)))}${this.theme.fg("borderMuted", " │")}`; };
		const title = truncateToWidth(` Plan · ${this.ticket} `, width - 2);
		const position = body.length > this.rows ? ` · Rows ${this.offset + 1}–${this.offset + visible.length}/${body.length}` : "";
		return [
			`${this.theme.fg("borderMuted", "╭")}${this.theme.fg("accent", this.theme.bold(title))}${this.theme.fg("borderMuted", `${"─".repeat(Math.max(0, width - visibleWidth(title) - 2))}╮`)}`,
			...visible.map(line),
			line(this.theme.fg("dim", `${this.plan.completed}/${this.plan.total} done${position}`)),
			line(this.theme.fg("dim", "↑↓ PgUp/PgDn · Esc close")),
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
