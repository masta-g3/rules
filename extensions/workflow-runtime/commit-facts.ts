import { execFile } from "node:child_process";
import { readdir, realpath } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import type { WorkflowCommitFact } from "./core.ts";

const run = promisify(execFile);

export type ReflogEntry = { hash: string; kind: string; subject: string };
export type WorkspaceRepo = { path: string; label: string };
export type RepoBaseline = WorkspaceRepo & { length: number };

const GIT_OPTIONS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env"]);
const HELPER_OPTIONS_WITH_VALUE = new Set(["--file", "--output"]);
const SHELLS = new Set(["bash", "sh", "zsh"]);

/** Splits a shell command into simple commands of unquoted words; quotes are removed, expansions kept as text. */
export function shellCommands(command: string): string[][] {
	const commands: string[][] = [];
	let words: string[] = [];
	let word: string | undefined;
	let quote: "'" | "\"" | undefined;
	const endWord = () => { if (word !== undefined) words.push(word); word = undefined; };
	const endCommand = () => { endWord(); if (words.length) commands.push(words); words = []; };
	for (let index = 0; index < command.length; index++) {
		const char = command[index]!;
		if (quote) {
			if (char === quote) quote = undefined;
			else if (char === "\\" && quote === "\"" && command[index + 1] === "\n") index += 1;
			else if (char === "\\" && quote === "\"" && index + 1 < command.length) word += command[++index]!;
			else word += char;
		} else if (char === "'" || char === "\"") { quote = char; word ??= ""; }
		// A backslash-newline continues the line and adds nothing.
		else if (char === "\\" && command[index + 1] === "\n") index += 1;
		else if (char === "\\" && index + 1 < command.length) word = (word ?? "") + command[++index]!;
		else if (/[;&|\n()]/.test(char)) endCommand();
		else if (/\s/.test(char)) endWord();
		else word = (word ?? "") + char;
	}
	endCommand();
	return commands;
}

/** The program and its arguments, past leading `VAR=value` assignments and a `bash script` wrapper. */
function invocation(words: string[]): { program: string; args: string[] } | undefined {
	let index = words.findIndex((word) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(word));
	if (index < 0) return undefined;
	if (SHELLS.has(basename(words[index]!)) && words[index + 1] && !words[index + 1]!.startsWith("-")) index += 1;
	return { program: basename(words[index]!), args: words.slice(index + 1) };
}

function subcommand(args: string[], optionsWithValue: Set<string>): string | undefined {
	for (let index = 0; index < args.length; index++) {
		const arg = args[index]!;
		if (optionsWithValue.has(arg)) { index += 1; continue; }
		if (!arg.startsWith("-")) return arg;
	}
	return undefined;
}

/** True when a simple command in `command` runs `git … commit` with commit as the git subcommand. */
export function runsGitCommit(command: string): boolean {
	return shellCommands(command).some((words) => {
		const call = invocation(words);
		return call?.program === "git" && subcommand(call.args, GIT_OPTIONS_WITH_VALUE) === "commit";
	});
}

/** The closeout helpers `command` runs: plan archiving and ticket completion. */
export function closeoutKinds(command: string): Array<"archived" | "ticketDone"> {
	const kinds = new Set<"archived" | "ticketDone">();
	for (const words of shellCommands(command)) {
		const call = invocation(words);
		if (call?.program === "archive_plan.sh") kinds.add("archived");
		if (call?.program === "features_yaml.sh" && subcommand(call.args, HELPER_OPTIONS_WITH_VALUE) === "complete") kinds.add("ticketDone");
	}
	return [...kinds];
}

async function git(cwd: string, args: string[]): Promise<string | undefined> {
	try { return (await run("git", args, { cwd, maxBuffer: 16 * 1024 * 1024 })).stdout; } catch { return undefined; }
}

async function repoRoot(path: string): Promise<string | undefined> {
	const root = (await git(path, ["rev-parse", "--show-toplevel"]))?.trim();
	return root ? realpath(root) : undefined;
}

/** The session cwd's repo plus each top-level symlink in the cwd that resolves to a repo root. */
export async function workspaceRepos(cwd: string): Promise<WorkspaceRepo[]> {
	const repos = new Map<string, string>();
	const own = await repoRoot(cwd);
	if (own) repos.set(own, basename(own));
	const entries = await readdir(cwd, { withFileTypes: true }).catch(() => []);
	for (const entry of entries) {
		if (!entry.isSymbolicLink()) continue;
		const target = await realpath(join(cwd, entry.name)).catch(() => undefined);
		if (target && !repos.has(target) && await repoRoot(target) === target) repos.set(target, entry.name);
	}
	return [...repos].map(([path, label]) => ({ path, label }));
}

/** HEAD reflog, newest first; an unborn HEAD has none. */
export async function headReflog(repo: string): Promise<ReflogEntry[]> {
	const output = await git(repo, ["reflog", "--format=%h%x09%gs", "HEAD"]);
	if (!output) return [];
	return output.split("\n").filter(Boolean).map((line) => {
		const [hash = "", selector = ""] = line.split("\t");
		const separator = selector.indexOf(": ");
		return separator < 0
			? { hash, kind: selector, subject: "" }
			: { hash, kind: selector.slice(0, separator), subject: selector.slice(separator + 2) };
	});
}

export async function baselines(repos: WorkspaceRepo[]): Promise<RepoBaseline[]> {
	return Promise.all(repos.map(async (repo) => ({ ...repo, length: (await headReflog(repo.path)).length })));
}

export type FoundCommit = WorkflowCommitFact & { rewritten?: string };

/** The newest commit each repo's HEAD reflog gained since its baseline; checkouts and resets are not commits. */
export async function newCommits(repos: RepoBaseline[]): Promise<FoundCommit[]> {
	const found: FoundCommit[] = [];
	for (const repo of repos) {
		const reflog = await headReflog(repo.path);
		const added = reflog.slice(0, Math.max(0, reflog.length - repo.length));
		const index = added.findIndex((entry) => entry.kind.startsWith("commit"));
		const entry = added[index];
		if (!entry) continue;
		const rewritten = entry.kind === "commit (amend)" ? reflog[index + 1]?.hash : undefined;
		found.push({ repo: repo.label, hash: entry.hash, subject: entry.subject, ...(rewritten ? { rewritten } : {}) });
	}
	return found;
}

/** Adds found commits; an amend replaces the item for the commit it rewrote. */
export function mergeCommits(commits: WorkflowCommitFact[], found: FoundCommit[]): WorkflowCommitFact[] {
	let next = commits;
	for (const { rewritten, ...fact } of found) {
		if (next.some((item) => item.repo === fact.repo && item.hash === fact.hash)) continue;
		const replaced = rewritten ? next.findIndex((item) => item.repo === fact.repo && item.hash === rewritten) : -1;
		next = replaced >= 0 ? next.map((item, position) => position === replaced ? fact : item) : [...next, fact];
	}
	return next;
}
