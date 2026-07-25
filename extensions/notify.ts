import { spawn } from "node:child_process";
import { basename } from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const READY = "Ready for input";
const TEST = "Notification test";

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

}

function notify(title: string, body: string): void {
	if (process.platform === "darwin") {
		notifyMac(title, body);
		return;
	}

	writeTerminalNotification(title, body);
}

function sessionName(pi: ExtensionAPI, ctx: ExtensionContext): string {
	return pi.getSessionName() ?? basename(ctx.sessionManager.getSessionFile() ?? "ephemeral");
}

function sessionBody(pi: ExtensionAPI, ctx: ExtensionContext): string {
	const project = basename(ctx.cwd);
	return `${project} - ${sessionName(pi, ctx)}`;
}

function notificationTitle(status: string): string {
	return `Pi ${status}`;
}

export default function (pi: ExtensionAPI) {
	pi.on("agent_end", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		notify(notificationTitle(READY), sessionBody(pi, ctx));
	});

	pi.registerCommand("notify-test", {
		description: "Send a test notification",
		handler: async (_args, ctx) => {
			notify(notificationTitle(TEST), sessionBody(pi, ctx));
			ctx.ui.notify("Sent notification test", "info");
		},
	});
}
