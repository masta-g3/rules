import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, resolve, sep } from "node:path";
import { parseWorktreeLifecycleSnapshot, type WorktreeLifecycleSnapshot } from "./worktree-context.ts";

export const CONTEXT_ENTRY_TYPE = "pi-agent-hub-context";
export const MAX_TICKET_ID = 80;
export const MAX_TITLE = 32;
export const MAX_SUBTITLE = 64;
export const MAX_DESCRIPTION = 240;
export const MAX_ATTENTION = 150;
export const MAX_REQUEST_ID = 64;
export const MAX_RECOMMENDATION = 150;
export const MAX_ARTIFACT = 1_024;
const MAX_PROJECT_CWD = 4_096;

export function effectiveProjectCwd(cwd: string, primaryCwd = process.env.PI_AGENT_HUB_PRIMARY_CWD): string {
	return typeof primaryCwd === "string" && primaryCwd.length <= MAX_PROJECT_CWD && !primaryCwd.includes("\0") && isAbsolute(primaryCwd)
		? primaryCwd
		: cwd;
}

export type SessionAttention = {
	requestId?: string;
	kind: "ready" | "question" | "blocked";
	text: string;
	recommendation?: string;
	artifact?: string;
};
export type TicketContext = { id: string; title?: string; subtitle?: string; description?: string; planFile?: string };
export type PiAgentHubContextV1 = {
	version: 1;
	updatedAt: number;
	ticket?: { id: string; subtitle?: string; description?: string };
	attention?: SessionAttention;
	worktree?: WorktreeLifecycleSnapshot;
};

type MessageContent = string | Array<{ type?: string; text?: string }>;
export type TranscriptEntry = { type?: string; message?: { role?: string; content?: MessageContent } };

export const NAMING_PROMPT = `Create a plain Pi session name.
Use 1–3 concrete words in Title Case.
Maximum 32 characters.
Return only the name.
Do not include a ticket ID, label, quote, or punctuation.`;

export function normalizeText(value: unknown, max: number): string | undefined {
	if (typeof value !== "string") return undefined;
	const text = value.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
	return text ? [...text].slice(0, max).join("") : undefined;
}

export function stableRequestId(toolCallId: unknown): string | undefined {
	if (typeof toolCallId !== "string" || !toolCallId) return undefined;
	return createHash("sha256").update(toolCallId).digest("hex");
}

// Artifacts are paths or URLs: keep internal whitespace, but reject terminal controls.
export function rawArtifact(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const text = value.trim();
	return text && [...text].length <= MAX_ARTIFACT && !/[\x00-\x1f\x7f-\x9f]/u.test(text) ? text : undefined;
}

export async function handOffAttention(
	toolCallId: string,
	params: { kind: unknown; text: unknown; recommendation?: unknown; artifact?: unknown },
	cwd: string,
): Promise<SessionAttention> {
	if (params.kind !== "ready" && params.kind !== "blocked") throw new Error("hand_off kind must be ready or blocked.");
	const text = normalizeText(params.text, MAX_ATTENTION + 1);
	if (!text || [...text].length > MAX_ATTENTION) throw new Error(`hand_off text must be 1–${MAX_ATTENTION} characters.`);
	let recommendation: string | undefined;
	if (params.recommendation !== undefined) {
		recommendation = normalizeText(params.recommendation, MAX_RECOMMENDATION + 1);
		if (!recommendation || [...recommendation].length > MAX_RECOMMENDATION) throw new Error(`hand_off recommendation must be 1–${MAX_RECOMMENDATION} characters.`);
	}
	let artifact: string | undefined;
	if (params.artifact !== undefined) {
		const raw = rawArtifact(params.artifact);
		if (!raw) throw new Error(`hand_off artifact must be a path or URL of at most ${MAX_ARTIFACT} characters without control characters.`);
		if (/^https?:\/\//iu.test(raw)) artifact = raw;
		else {
			const path = resolve(cwd, raw);
			try { await stat(path); } catch { throw new Error(`hand_off artifact not found: ${path}`); }
			artifact = rawArtifact(path);
			if (!artifact) throw new Error(`hand_off artifact path exceeds ${MAX_ARTIFACT} characters.`);
		}
	}
	const requestId = stableRequestId(toolCallId);
	return { ...(requestId ? { requestId } : {}), kind: params.kind, text, ...(recommendation ? { recommendation } : {}), ...(artifact ? { artifact } : {}) };
}

export function questionAttention(toolCallId: unknown, args: unknown): SessionAttention | undefined {
	const requestId = stableRequestId(toolCallId);
	if (!requestId || !args || typeof args !== "object" || Array.isArray(args)) return undefined;
	const questions = (args as Record<string, unknown>).questions;
	if (!Array.isArray(questions) || questions.length === 0) return undefined;
	const first = questions[0];
	if (!first || typeof first !== "object" || Array.isArray(first)) return undefined;
	const more = questions.length - 1;
	const suffix = more > 0 ? ` (+${more} more)` : "";
	const question = normalizeText((first as Record<string, unknown>).question, MAX_ATTENTION - [...suffix].length);
	if (!question) return undefined;
	return { requestId, kind: "question", text: `${question}${suffix}` };
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
		const requestId = raw.requestId === undefined ? undefined : normalizeText(raw.requestId, MAX_REQUEST_ID);
		if (raw.requestId !== undefined && (!requestId || requestId !== raw.requestId)) return undefined;
		const text = normalizeText(raw.text, MAX_ATTENTION);
		if (!text || text !== raw.text) return undefined;
		const recommendation = raw.recommendation === undefined ? undefined : normalizeText(raw.recommendation, MAX_RECOMMENDATION);
		if (raw.recommendation !== undefined && (!recommendation || recommendation !== raw.recommendation)) return undefined;
		const artifact = raw.artifact === undefined ? undefined : rawArtifact(raw.artifact);
		if (raw.artifact !== undefined && (!artifact || artifact !== raw.artifact)) return undefined;
		attention = {
			...(requestId ? { requestId } : {}),
			kind: raw.kind as SessionAttention["kind"],
			text,
			...(recommendation ? { recommendation } : {}),
			...(artifact ? { artifact } : {}),
		};
	}
	const worktree = parseWorktreeLifecycleSnapshot(item.worktree);
	return { version: 1, updatedAt: item.updatedAt, ...(ticket ? { ticket } : {}), ...(attention ? { attention } : {}), ...(worktree ? { worktree } : {}) };
}

export function contextSnapshot(ticket?: TicketContext, attention?: SessionAttention, updatedAt = Date.now(), worktree?: WorktreeLifecycleSnapshot): PiAgentHubContextV1 {
	return {
		version: 1,
		updatedAt,
		...(ticket ? { ticket: { id: ticket.id, ...(ticket.subtitle ? { subtitle: ticket.subtitle } : {}), ...(ticket.description ? { description: ticket.description } : {}) } } : {}),
		...(attention ? { attention } : {}),
		...(worktree ? { worktree } : {}),
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
