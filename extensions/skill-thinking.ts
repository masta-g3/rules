import { readFileSync } from "node:fs";
import { parseFrontmatter, type ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

const SKILL_PREFIX = /^\/skill:([a-z0-9-]+)(?:\s|$)/;
const VALID_THINKING_LEVELS = new Set<ThinkingLevel>(["off", "minimal", "low", "medium", "high", "xhigh"]);

function isThinkingLevel(value: unknown): value is ThinkingLevel {
	return typeof value === "string" && VALID_THINKING_LEVELS.has(value as ThinkingLevel);
}

function readThinkingLevel(filePath: string): ThinkingLevel | undefined {
	const source = readFileSync(filePath, "utf8");
	const { frontmatter } = parseFrontmatter(source);
	const metadata = frontmatter.metadata;
	if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return;

	const level = (metadata as Record<string, unknown>).thinkingLevel;
	return isThinkingLevel(level) ? level : undefined;
}

export default function skillThinking(pi: ExtensionAPI): void {
	let pendingSkill: string | undefined;
	let restoreLevel: ThinkingLevel | undefined;

	function restoreThinkingLevel(): void {
		if (!restoreLevel) return;
		pi.setThinkingLevel(restoreLevel);
		restoreLevel = undefined;
	}

	pi.on("input", async (event) => {
		if (event.source === "extension") return { action: "continue" };
		pendingSkill = event.text.match(SKILL_PREFIX)?.[1];
		return { action: "continue" };
	});

	pi.on("before_agent_start", async (event) => {
		if (!pendingSkill) return;

		const skillName = pendingSkill;
		pendingSkill = undefined;
		const skill = event.systemPromptOptions.skills?.find((candidate) => candidate.name === skillName);
		if (!skill) return;

		const level = readThinkingLevel(skill.filePath);
		if (!level) return;

		if (!restoreLevel) restoreLevel = pi.getThinkingLevel();
		pi.setThinkingLevel(level);
	});

	pi.on("agent_end", async () => restoreThinkingLevel());
	pi.on("session_shutdown", async () => restoreThinkingLevel());
}
