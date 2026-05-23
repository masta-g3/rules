import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const APP_NAME = "Pi";
const READY = "Ready for input";
const TEST = "Notification test";
const SOUND_PATH = "/System/Library/Sounds/Glass.aiff";

function run(command: string, args: string[]): void {
	const child = spawn(command, args, { detached: true, stdio: "ignore" });
	child.on("error", () => {});
	child.unref();
}

function appleString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function writeTerminalNotification(title: string, body: string): void {
	const sequence = `\x1b]777;notify;${title};${body}\x07`;
	if (process.env.TMUX) {
		process.stdout.write(`\x1bPtmux;${sequence.replace(/\x1b/g, "\x1b\x1b")}\x1b\\`);
		return;
	}
	process.stdout.write(sequence);
}

function notifyMac(title: string, body: string): void {
	run("osascript", ["-e", `display notification ${appleString(body)} with title ${appleString(title)}`]);

	if (existsSync(SOUND_PATH)) {
		run("afplay", [SOUND_PATH]);
		return;
	}

	process.stdout.write("\x07");
}

function notify(title: string, body: string): void {
	if (process.platform === "darwin") {
		notifyMac(title, body);
		return;
	}

	writeTerminalNotification(title, body);
	process.stdout.write("\x07");
}

function sessionName(pi: ExtensionAPI, ctx: ExtensionContext): string {
	return pi.getSessionName() ?? basename(ctx.sessionManager.getSessionFile() ?? "ephemeral");
}

function sessionTitle(pi: ExtensionAPI, ctx: ExtensionContext): string {
	return `${APP_NAME} · ${sessionName(pi, ctx)}`;
}

function sessionBody(_pi: ExtensionAPI, ctx: ExtensionContext, status: string): string {
	const project = basename(ctx.cwd);
	return [`${status}`, project].join("\n");
}

export default function (pi: ExtensionAPI) {
	pi.on("agent_end", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		notify(sessionTitle(pi, ctx), sessionBody(pi, ctx, READY));
	});

	pi.registerCommand("notify-test", {
		description: "Send a test notification and sound",
		handler: async (_args, ctx) => {
			notify(sessionTitle(pi, ctx), sessionBody(pi, ctx, TEST));
			ctx.ui.notify("Sent notification test", "info");
		},
	});
}
