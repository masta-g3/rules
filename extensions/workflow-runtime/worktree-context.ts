import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

export type WorktreeLifecycleRepository = {
	sourcePath: string;
	worktreePath: string;
	branch: string;
	role: "primary" | "additional";
	state: "active" | "awaiting-merge" | "cleanup-pending" | "check-needed" | "cleaned";
	outcome?: "merged" | "discarded";
	verifiedAt?: number;
	issue?: string;
};

export type WorktreeLifecycleSnapshot = {
	version: 1;
	recordId: string;
	producer: string;
	revision: number;
	updatedAt: number;
	cleared?: true;
	repositories?: WorktreeLifecycleRepository[];
};

export function parseWorktreeLifecycleSnapshot(value: unknown): WorktreeLifecycleSnapshot | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const item = value as Record<string, unknown>;
	const recordId = normalizedText(item.recordId, 128);
	const producer = normalizedText(item.producer, 80);
	if (item.version !== 1 || !recordId || !producer || !Number.isSafeInteger(item.revision) || Number(item.revision) < 0
		|| typeof item.updatedAt !== "number" || !Number.isFinite(item.updatedAt)) return undefined;
	if (item.cleared === true) return item.repositories === undefined
		? { version: 1, recordId, producer, revision: Number(item.revision), updatedAt: item.updatedAt, cleared: true }
		: undefined;
	if (!Array.isArray(item.repositories) || item.repositories.length < 1 || item.repositories.length > 16) return undefined;
	let primary = 0;
	const paths = new Set<string>();
	const repositories: WorktreeLifecycleRepository[] = [];
	for (const raw of item.repositories) {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
		const repo = raw as Record<string, unknown>;
		const sourcePath = rawText(repo.sourcePath, 1024);
		const worktreePath = rawText(repo.worktreePath, 1024);
		const branch = rawText(repo.branch, 240);
		const issue = repo.issue === undefined ? undefined : normalizedText(repo.issue, 240);
		if (!sourcePath || !isAbsolute(sourcePath) || !worktreePath || !isAbsolute(worktreePath) || !branch
			|| (repo.role !== "primary" && repo.role !== "additional") || !STATES.has(String(repo.state))) return undefined;
		if (repo.outcome !== undefined && repo.outcome !== "merged" && repo.outcome !== "discarded") return undefined;
		if (repo.verifiedAt !== undefined && (typeof repo.verifiedAt !== "number" || !Number.isFinite(repo.verifiedAt))) return undefined;
		if (repo.issue !== undefined && !issue) return undefined;
		primary += repo.role === "primary" ? 1 : 0;
		if (paths.has(worktreePath)) return undefined;
		paths.add(worktreePath);
		repositories.push({
			sourcePath, worktreePath, branch,
			role: repo.role, state: repo.state as WorktreeLifecycleRepository["state"],
			...(repo.outcome ? { outcome: repo.outcome as WorktreeLifecycleRepository["outcome"] } : {}),
			...(typeof repo.verifiedAt === "number" ? { verifiedAt: repo.verifiedAt } : {}),
			...(issue ? { issue } : {}),
		});
	}
	return primary === 1 ? {
		version: 1, recordId, producer, revision: Number(item.revision), updatedAt: item.updatedAt, repositories,
	} : undefined;
}

const normalizedText = (value: unknown, max: number): string | undefined => {
	if (typeof value !== "string") return undefined;
	const text = value.replace(/[\x00-\x1f\x7f]/g, " ").replace(/\s+/g, " ").trim();
	return text && [...text].length <= max ? text : undefined;
};

const rawText = (value: unknown, max: number): string | undefined => {
	if (typeof value !== "string") return undefined;
	const text = value.trim();
	return text && [...text].length <= max && !/[\r\n\0]/u.test(text) ? text : undefined;
};

export type WorktreeBinding = {
	recordPath: string;
	recordId: string;
	ticket: string;
	authoredRoot: string;
	snapshot: WorktreeLifecycleSnapshot;
};

const STATES = new Set(["active", "awaiting-merge", "cleanup-pending", "check-needed", "cleaned"]);
const isoTime = (value: unknown): number | undefined => {
	if (typeof value !== "string") return undefined;
	const parsed = Date.parse(value);
	return Number.isFinite(parsed) ? parsed : undefined;
};

export async function readWorktreeBinding(recordPath: string, ticketId: string): Promise<WorktreeBinding | undefined> {
	if (!isAbsolute(recordPath) || recordPath.includes("\0")) return undefined;
	let value: unknown;
	try { value = JSON.parse(await readFile(recordPath, "utf8")); } catch { return undefined; }
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const record = value as Record<string, unknown>;
	if (record.version !== 1 || record.owner !== "rules" || record.recordPath !== resolve(recordPath)
		|| typeof record.id !== "string" || !record.id || record.id.length > 128
		|| record.ticket !== ticketId || !Number.isSafeInteger(record.revision) || Number(record.revision) < 0
		|| typeof record.authoredRoot !== "string" || !isAbsolute(record.authoredRoot)
		|| !Array.isArray(record.repositories) || record.repositories.length < 1 || record.repositories.length > 16) return undefined;
	const repositories: WorktreeLifecycleRepository[] = [];
	const worktreePaths = new Set<string>();
	const sourcePaths = new Set<string>();
	for (const raw of record.repositories) {
		if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
		const item = raw as Record<string, unknown>;
		if (typeof item.source !== "string" || item.source.length > 1024 || !isAbsolute(item.source)
			|| typeof item.worktree !== "string" || item.worktree.length > 1024 || !isAbsolute(item.worktree)
			|| typeof item.branch !== "string" || !item.branch || item.branch.length > 240
			|| (item.role !== "primary" && item.role !== "additional") || !STATES.has(String(item.state))) return undefined;
		if (worktreePaths.has(resolve(item.worktree)) || sourcePaths.has(resolve(item.source))) return undefined;
		worktreePaths.add(resolve(item.worktree));
		sourcePaths.add(resolve(item.source));
		const issue = typeof item.issue === "string" ? item.issue.replace(/\s+/g, " ").trim().slice(0, 240) : undefined;
		const outcome = item.outcome === "merged" || item.outcome === "discarded" ? item.outcome : undefined;
		repositories.push({
			sourcePath: item.source, worktreePath: item.worktree, branch: item.branch, role: item.role,
			state: item.state as WorktreeLifecycleRepository["state"], ...(outcome ? { outcome } : {}),
			...(isoTime(item.verifiedAt) !== undefined ? { verifiedAt: isoTime(item.verifiedAt)! } : {}), ...(issue ? { issue } : {}),
		});
	}
	if (repositories.filter((item) => item.role === "primary").length !== 1) return undefined;
	const primary = repositories.find((item) => item.role === "primary")!;
	const authoredRoot = resolve(record.authoredRoot);
	if (record.state !== "cleaned" && authoredRoot !== resolve(primary.worktreePath)) return undefined;
	if (record.state === "cleaned" && authoredRoot !== resolve(primary.sourcePath)) return undefined;
	return {
		recordPath: resolve(recordPath), recordId: record.id, ticket: ticketId, authoredRoot,
		snapshot: { version: 1, recordId: record.id, producer: "rules", revision: Number(record.revision), updatedAt: isoTime(record.updatedAt) ?? Date.now(), repositories },
	};
}

function lifecycleContent(snapshot: WorktreeLifecycleSnapshot): string {
	return JSON.stringify({ recordId: snapshot.recordId, producer: snapshot.producer, cleared: snapshot.cleared, repositories: snapshot.repositories });
}

export function projectWorktreeSnapshot(snapshot: WorktreeLifecycleSnapshot, previous?: WorktreeLifecycleSnapshot): WorktreeLifecycleSnapshot {
	const normalized = { ...snapshot, producer: "rules" };
	if (!previous) return normalized;
	if (lifecycleContent(normalized) === lifecycleContent(previous) && normalized.revision <= previous.revision) return previous;
	const revision = normalized.revision > previous.revision ? normalized.revision : previous.revision + 1;
	return { ...normalized, revision, updatedAt: revision === normalized.revision ? normalized.updatedAt : Date.now() };
}

export function brokenWorktreeSnapshot(previous: WorktreeLifecycleSnapshot, issue = "Bound worktree record is missing or invalid"): WorktreeLifecycleSnapshot {
	if (previous.producer === "rules" && previous.repositories?.every((item) => item.state === "check-needed" && item.issue === issue)) return previous;
	return {
		...previous,
		producer: "rules",
		revision: previous.revision + 1,
		updatedAt: Date.now(),
		repositories: previous.repositories?.map((item) => ({ ...item, state: "check-needed", issue })),
	};
}

export function clearedWorktreeSnapshot(previous: WorktreeLifecycleSnapshot): WorktreeLifecycleSnapshot {
	return { version: 1, recordId: previous.recordId, producer: "rules", revision: previous.revision + 1, updatedAt: Date.now(), cleared: true };
}
