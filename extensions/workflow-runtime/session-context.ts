import { readFile } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";

export const CONTEXT_ENTRY_TYPE = "pi-agent-hub-context";
export const MAX_TICKET_ID = 80;
export const MAX_TITLE = 32;
export const MAX_SUBTITLE = 64;
export const MAX_DESCRIPTION = 240;
export const MAX_ATTENTION = 96;
const MAX_PROJECT_CWD = 4_096;

export function effectiveProjectCwd(cwd: string, primaryCwd = process.env.PI_AGENT_HUB_PRIMARY_CWD): string {
	return typeof primaryCwd === "string" && primaryCwd.length <= MAX_PROJECT_CWD && !primaryCwd.includes("\0") && isAbsolute(primaryCwd)
		? primaryCwd
		: cwd;
}

export type SessionAttention = { kind: "ready" | "question" | "blocked"; text: string };
export type TicketContext = { id: string; title?: string; subtitle?: string; description?: string; planFile?: string };
export type PiAgentHubContextV1 = {
	version: 1;
	updatedAt: number;
	ticket?: { id: string; subtitle?: string; description?: string };
	attention?: SessionAttention;
};

type MessageContent = string | Array<{ type?: string; text?: string }>;
export type TranscriptEntry = { type?: string; message?: { role?: string; content?: MessageContent } };

export const NAMING_PROMPT = `Create a plain Pi session name.
Use 1–3 concrete words in Title Case.
Maximum 32 characters.
Return only the name.
Do not include a ticket ID, label, quote, or punctuation.`;

export const ATTENTION_PROMPT = `Decide whether the completed turn explicitly needs human attention.
Return JSON only: null, or {"kind":"ready|question|blocked","text":"exact action or reason","confidence":0.0}.
Use ready only for an explicit reviewable handoff, question only for an explicit answer or decision, and blocked only for an explicit inability to proceed. Otherwise return null.`;

export function normalizeText(value: unknown, max: number): string | undefined {
	if (typeof value !== "string") return undefined;
	const text = value.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
	return text ? [...text].slice(0, max).join("") : undefined;
}

function unquote(value: string): string {
	const text = value.trim();
	if ((text.startsWith("\"") && text.endsWith("\"")) || (text.startsWith("'") && text.endsWith("'"))) return text.slice(1, -1);
	return text === "null" || text === "~" ? "" : text;
}

function safePath(cwd: string, relative: string): string | undefined {
	const root = resolve(cwd);
	const full = resolve(root, relative);
	return full === root || full.startsWith(`${root}${sep}`) ? full : undefined;
}

function legacyPlanTitle(value: unknown, ticketId: string): string | undefined {
	if (typeof value !== "string") return undefined;
	const arrow = /^`?([^`\s]+)`?\s*(?:→|->)\s*(.+)$/u.exec(value.trim());
	const candidate = arrow?.[1]?.toLowerCase() === ticketId ? arrow[2] : value;
	const title = normalizeText(candidate, MAX_DESCRIPTION);
	if (!title || [...title].length > MAX_TITLE || title.split(/\s+/).length > 3) return undefined;
	return title;
}

export async function readTicketContext(cwd: string, ticketId: string): Promise<TicketContext | undefined> {
	const id = normalizeText(ticketId.toLowerCase(), MAX_TICKET_ID);
	if (!id) return undefined;
	let yaml: string;
	try { yaml = await readFile(resolve(cwd, "agent-work/features.yaml"), "utf8"); } catch { return undefined; }
	let current: Record<string, string> | undefined;
	let currentField: string | undefined;
	const foldedFields = new Set(["title", "subtitle", "description", "plan_file"]);
	for (const line of `${yaml}\n- end:`.split(/\r?\n/)) {
		if (/^-\s+/.test(line)) {
			if (current?.id?.toLowerCase() === id) break;
			current = {};
			currentField = undefined;
		}
		const field = /^(?:-\s+| {2})([a-zA-Z_]+):\s*(.*?)\s*$/.exec(line);
		if (current && field) {
			currentField = field[1]!;
			current[currentField] = unquote(field[2] ?? "");
			continue;
		}
		if (current && currentField && foldedFields.has(currentField) && /^\s{4,}\S/u.test(line)) {
			current[currentField] = `${current[currentField]} ${line.trim()}`.trim();
		}
	}
	if (current?.id?.toLowerCase() !== id) return undefined;
	const planFile = normalizeText(current.plan_file, 240);
	let title = normalizeText(current.title, MAX_TITLE);
	if (!title && planFile) {
		const path = safePath(cwd, planFile);
		if (path) {
			try {
				const plan = await readFile(path, "utf8");
				title = legacyPlanTitle(plan.match(/^\*\*Feature:\*\*\s*(.+)$/mi)?.[1] ?? plan.match(/^#\s+Feature:\s*(.+)$/mi)?.[1], id);
			} catch { /* absent plans are a valid legacy state */ }
		}
	}
	return {
		id,
		...(title ? { title } : {}),
		...(normalizeText(current.subtitle, MAX_SUBTITLE) ? { subtitle: normalizeText(current.subtitle, MAX_SUBTITLE)! } : {}),
		...(normalizeText(current.description, MAX_DESCRIPTION) ? { description: normalizeText(current.description, MAX_DESCRIPTION)! } : {}),
		...(planFile ? { planFile } : {}),
	};
}

export function parseContextSnapshot(value: unknown): PiAgentHubContextV1 | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const item = value as Record<string, unknown>;
	if (item.version !== 1 || typeof item.updatedAt !== "number" || !Number.isFinite(item.updatedAt)) return undefined;
	let ticket: PiAgentHubContextV1["ticket"];
	if (item.ticket !== undefined) {
		if (!item.ticket || typeof item.ticket !== "object" || Array.isArray(item.ticket)) return undefined;
		const raw = item.ticket as Record<string, unknown>;
		const id = normalizeText(raw.id, MAX_TICKET_ID);
		if (!id || id !== raw.id) return undefined;
		const subtitle = raw.subtitle === undefined ? undefined : normalizeText(raw.subtitle, MAX_SUBTITLE);
		const description = raw.description === undefined ? undefined : normalizeText(raw.description, MAX_DESCRIPTION);
		if ((raw.subtitle !== undefined && subtitle !== raw.subtitle) || (raw.description !== undefined && description !== raw.description)) return undefined;
		ticket = { id, ...(subtitle ? { subtitle } : {}), ...(description ? { description } : {}) };
	}
	let attention: SessionAttention | undefined;
	if (item.attention !== undefined) {
		if (!item.attention || typeof item.attention !== "object" || Array.isArray(item.attention)) return undefined;
		const raw = item.attention as Record<string, unknown>;
		if (!(["ready", "question", "blocked"] as unknown[]).includes(raw.kind)) return undefined;
		const text = normalizeText(raw.text, MAX_ATTENTION);
		if (!text || text !== raw.text) return undefined;
		attention = { kind: raw.kind as SessionAttention["kind"], text };
	}
	return { version: 1, updatedAt: item.updatedAt, ...(ticket ? { ticket } : {}), ...(attention ? { attention } : {}) };
}

export function contextSnapshot(ticket?: TicketContext, attention?: SessionAttention, updatedAt = Date.now()): PiAgentHubContextV1 {
	return {
		version: 1,
		updatedAt,
		...(ticket ? { ticket: { id: ticket.id, ...(ticket.subtitle ? { subtitle: ticket.subtitle } : {}), ...(ticket.description ? { description: ticket.description } : {}) } } : {}),
		...(attention ? { attention } : {}),
	};
}

function textContent(content: MessageContent | undefined): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");
}

export function recentTranscript(entries: readonly TranscriptEntry[]): string {
	const messages = entries.flatMap((entry) => {
		const role = entry.type === "message" ? entry.message?.role : undefined;
		if (role !== "user" && role !== "assistant") return [];
		const text = normalizeText(textContent(entry.message?.content), 600);
		return text ? [{ role, text }] : [];
	}).slice(-6);
	while (messages.length && [...messages.map((item) => `${item.role === "user" ? "User" : "Assistant"}: ${item.text}`).join("\n\n")].length > 3_000) messages.shift();
	return [...messages.map((item) => `${item.role === "user" ? "User" : "Assistant"}: ${item.text}`).join("\n\n")].slice(0, 3_000).join("");
}

export function ticketNamingInput(ticket: TicketContext, transcript: string): string {
	const prefix = [
		`Ticket: ${ticket.id}`,
		ticket.subtitle ? `Subtitle: ${ticket.subtitle}` : "",
		ticket.description ? `Description: ${ticket.description}` : "",
	].filter(Boolean).join("\n");
	const messages = transcript.split(/\n\n/u).filter(Boolean);
	const withConversation = () => messages.length ? `${prefix}\nConversation: ${messages.join("\n\n")}` : prefix;
	while (messages.length && [...withConversation()].length > 3_000) messages.shift();
	return normalizeText(withConversation(), 3_000) ?? ticket.id;
}

export function sanitizeSessionName(raw: string): string | undefined {
	let name = raw.split(/\r?\n/).find((line) => line.trim())?.trim() ?? "";
	name = name.replace(/^```(?:text)?\s*/i, "").replace(/^(?:title|name):\s*/i, "").replace(/^['"`]+|['"`]+$/g, "").trim();
	if (!name || [...name].length > MAX_TITLE || !/^[\p{L}\p{N}]+(?: [\p{L}\p{N}]+){0,2}$/u.test(name)) return undefined;
	return name.split(/\s+/).map((word) => word ? word[0]!.toLocaleUpperCase() + word.slice(1).toLocaleLowerCase() : word).join(" ");
}

export function parseAttention(raw: string): SessionAttention | null | undefined {
	let value: unknown;
	try { value = JSON.parse(raw.trim()); } catch { return undefined; }
	if (value === null) return null;
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const item = value as Record<string, unknown>;
	if (!(["ready", "question", "blocked"] as unknown[]).includes(item.kind)) return undefined;
	if (typeof item.confidence !== "number" || item.confidence < 0.5 || item.confidence > 1) return undefined;
	const text = normalizeText(item.text, MAX_ATTENTION);
	if (!text || [...String(item.text).replace(/\s+/g, " ").trim()].length > MAX_ATTENTION) return undefined;
	return { kind: item.kind as SessionAttention["kind"], text };
}

export function attentionInput(user: string | undefined, assistant: string | undefined, ticket?: TicketContext, activity?: string): string | undefined {
	const request = normalizeText(user, 1_000);
	const response = normalizeText(assistant, 1_500);
	if (!request || !response) return undefined;
	const context = normalizeText([ticket?.title, ticket?.subtitle, ticket?.description, activity].filter(Boolean).join(" · "), 1_000);
	return `User request: ${request}\nFinal assistant response: ${response}${context ? `\nCurrent context: ${context}` : ""}`;
}
