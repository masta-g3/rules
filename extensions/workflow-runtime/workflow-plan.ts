import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

export type PlanTask = { done: boolean; text: string };
export type PlanSection = { heading?: string; tasks: PlanTask[] };
export type WorkflowPlan = { sections: PlanSection[]; completed: number; total: number; currentSectionIndex: number };
export type PlanProjection = {
	phase?: { index: number; count: number; title: string };
	tasks: { completed: number; total: number };
	phases?: Array<{ completed: number; total: number }>;
	nextStep?: string;
};

const clean = (value: string, max = 120) => [...value.replace(/\s+/g, " ").trim()].slice(0, max).join("");

function projectPath(cwd: string, relative: string): string | undefined {
	const root = resolve(cwd);
	const path = resolve(root, relative);
	return path === root || path.startsWith(`${root}${sep}`) ? path : undefined;
}

export function parseWorkflowPlan(text: string): { plan?: WorkflowPlan; projection?: PlanProjection } {
	const all: PlanTask[] = [];
	const sections: Array<PlanSection & { title?: string; headingLevel: number }> = [];
	let active: (typeof sections)[number] | undefined;
	let fence: { marker: string; length: number } | undefined;
	for (const line of text.split(/\r?\n/)) {
		const delimiter = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
		if (fence) {
			if (delimiter?.[1]?.[0] === fence.marker && delimiter[1].length >= fence.length && !delimiter[2]?.trim()) fence = undefined;
			continue;
		}
		if (delimiter?.[1]) { fence = { marker: delimiter[1][0]!, length: delimiter[1].length }; continue; }
		const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
		if (heading) {
			const headingLevel = heading[1]!.length;
			const match = /^(phase|stage)\s+(\d+)\s*(?::|[-–—])\s*(.+)$/i.exec(heading[2] ?? "");
			if (match) {
				const title = clean(match[3] ?? "", 80);
				active = { heading: `${match[1]!.toLowerCase() === "stage" ? "Stage" : "Phase"} ${match[2]} · ${title}`, headingLevel, title, tasks: [] };
				sections.push(active);
			} else if (active && headingLevel < active.headingLevel) {
				active = undefined;
			}
			continue;
		}
		const checkbox = /^\s*-\s+\[([ xX])]\s+(.+?)\s*$/.exec(line);
		if (!checkbox) continue;
		const task = { done: checkbox[1]!.toLowerCase() === "x", text: clean(checkbox[2] ?? "") };
		all.push(task); active?.tasks.push(task);
	}
	const populated = sections.filter((section) => section.tasks.length);
	const tasks = populated.length ? populated.flatMap((section) => section.tasks) : all;
	if (!tasks.length) return {};
	const current = populated.findIndex((section) => section.tasks.some((task) => !task.done));
	const selected = populated.length ? (current >= 0 ? current : populated.length - 1) : 0;
	const planSections: PlanSection[] = populated.length ? populated.map(({ heading, tasks }) => ({ heading, tasks })) : [{ tasks: all }];
	const plan: WorkflowPlan = { sections: planSections, completed: tasks.filter((task) => task.done).length, total: tasks.length, currentSectionIndex: selected };
	const section = populated[selected];
	const projection: PlanProjection = {
		...(section ? { phase: { index: selected + 1, count: populated.length, title: section.title! } } : {}),
		tasks: { completed: plan.completed, total: plan.total },
		...(populated.length ? { phases: populated.slice(0, 100).map((item) => ({ completed: item.tasks.filter((task) => task.done).length, total: item.tasks.length })) } : {}),
		...(tasks.find((task) => !task.done) ? { nextStep: tasks.find((task) => !task.done)!.text } : {}),
	};
	return { plan, projection };
}

export async function readWorkflowPlan(cwd: string, planFile: string): Promise<{ plan?: WorkflowPlan; projection?: PlanProjection }> {
	const path = projectPath(cwd, planFile);
	if (!path) return {};
	try { return parseWorkflowPlan(await readFile(path, "utf8")); } catch { return {}; }
}
