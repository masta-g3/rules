import { basename } from "node:path";
import { shellCommands } from "./commit-facts.ts";
import type { WorkflowLens } from "./core.ts";
import { normalizeText } from "./session-context.ts";

type Stage = "explore" | "change" | "verify";
const STAGES: Stage[] = ["explore", "change", "verify"];
const READ_TOOLS = new Set(["read", "grep", "find", "ls", "web_search", "fetch_content"]);
const GIT_VALUE_OPTIONS = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace"]);

function shellStage(input: string): Stage | undefined {
	// Redirections to a descriptor or /dev/null write no file; dropping them also keeps `2>&1` from splitting a command.
	const command = input.replace(/\d*>>?\s*(?:&\d+|\/dev\/null\b)/g, "");
	// Quoted > characters are arguments, not shell redirections.
	if (/(?:^|[^<])>>?/.test(command.replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, ""))) return "change";
	let stage: Stage | undefined;
	for (const words of shellCommands(command)) {
		let index = words.findIndex(word => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word));
		if (index < 0) continue;
		let program = basename(words[index]!);
		if (program === "env") {
			index += 1;
			while (words[index]?.startsWith("-") || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index] ?? "")) {
				if (words[index] === "-u" || words[index] === "--unset") index += 1;
				index += 1;
			}
			program = basename(words[index] ?? "");
		}
		const args = words.slice(index + 1);
		let next: Stage | undefined;
		if (["bash", "sh", "zsh"].includes(program) && args[0]?.includes("c")) next = shellStage(args[1] ?? "");
		else if (program === "uv" && args[0] === "run") next = shellStage(args.slice(1).join(" "));
		else if (["npx", "pnpm", "yarn"].includes(program)) next = shellStage(args.join(" "));
		else if (["test", "pytest", "typecheck", "tsc", "lint", "eslint"].includes(program)
			|| (program === "node" && args.includes("--test"))
			|| (program === "npm" && (args[0] === "test" || args[0] === "run" && /(?:test|check|lint)/.test(args[1] ?? "")))) next = "verify";
		else if (["mv", "cp", "rm"].includes(program)) next = "change";
		else if (["rg", "grep", "cat", "ls", "find", "head", "tail", "pwd"].includes(program) || program === "sed" && args.includes("-n")) next = "explore";
		else if (program === "git") {
			let subcommand: string | undefined;
			for (let i = 0; i < args.length; i++) {
				if (GIT_VALUE_OPTIONS.has(args[i]!)) { i += 1; continue; }
				if (!args[i]!.startsWith("-")) { subcommand = args[i]; break; }
			}
			if (["log", "show", "diff", "status"].includes(subcommand ?? "")) next = "explore";
			if (["add", "commit", "apply"].includes(subcommand ?? "")) next = "change";
		}
		// A later read, such as `| tail`, does not hide an earlier change or check.
		if (next && !(next === "explore" && stage)) stage = next;
	}
	return stage;
}

export function classifyTool(tool: string, args: unknown): Stage | undefined {
	if (READ_TOOLS.has(tool)) return "explore";
	if (tool === "edit" || tool === "write") return "change";
	const command = (args as { command?: unknown } | undefined)?.command;
	return tool === "bash" && typeof command === "string" ? shellStage(command) : undefined;
}

function toolDoing(tool: string, args: unknown, stage: Stage): string {
	const raw = args as { path?: unknown; pattern?: unknown; query?: unknown; command?: unknown } | undefined;
	const verb = tool === "edit" ? "Editing" : tool === "write" ? "Writing" : tool === "read" ? "Reading"
		: stage === "verify" ? "Checking" : stage === "change" ? "Changing" : "Inspecting";
	const argument = normalizeText(raw?.path ?? raw?.pattern ?? raw?.query ?? raw?.command, 95);
	return argument ? `${verb} ${argument}` : verb;
}

/** Runtime observations only. A completed call advances WHERE; only an in-flight call supplies DOING. */
export class OpenSessionTrack {
	turn = 0;
	private sequence = 0;
	private observations = new Map<Stage, { turn: number; sequence: number }>();
	private calls = new Map<string, { stage?: Stage; doing?: string }>();
	private previousGoal?: string;

	beginTurn(): void { this.turn += 1; }
	endTurn(): void { this.calls.clear(); }
	restore(stages: unknown): void {
		if (!Array.isArray(stages) || stages.length !== STAGES.length || !stages.every((stage, index) =>
			stage?.label === STAGES[index] && ["done", "active", "pending"].includes(stage.state))) return;
		// Completed stages precede the active one; in-flight DOING never survives a process boundary.
		for (const state of ["done", "active"]) for (const stage of stages) {
			if (stage.state === state) this.observations.set(stage.label, { turn: this.turn, sequence: ++this.sequence });
		}
	}
	reset(): void { this.observations.clear(); this.calls.clear(); this.previousGoal = undefined; }
	start(id: string, tool: string, args: unknown): void {
		const stage = classifyTool(tool, args);
		this.calls.set(id, stage ? { stage, doing: toolDoing(tool, args, stage) } : {});
	}
	finish(id: string): Stage | undefined {
		// Pi's completion event has no arguments. Capture classification at start, apply it only at end.
		const call = this.calls.get(id);
		this.calls.delete(id);
		if (call?.stage) this.observations.set(call.stage, { turn: this.turn, sequence: ++this.sequence });
		return call?.stage;
	}
	goal(goal: string | undefined, turn: number): void {
		if (!goal) return;
		if (this.previousGoal && this.previousGoal !== goal) {
			for (const [stage, observation] of this.observations) if (observation.turn < turn) this.observations.delete(stage);
		}
		this.previousGoal = goal;
	}
	lens(): WorkflowLens | undefined {
		const doing = [...this.calls.values()].at(-1)?.doing;
		const active = [...this.observations].sort((a, b) => b[1].sequence - a[1].sequence)[0]?.[0];
		if (!doing && !active) return undefined;
		return {
			...(doing ? { doing } : {}),
			...(active ? { stages: STAGES.map(label => ({ label, state: label === active ? "active" as const : this.observations.has(label) ? "done" as const : "pending" as const })) } : {}),
		};
	}
}
