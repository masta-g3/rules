import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const ENTRY_TYPE = "long-execute";
const LONG_EXECUTE_PREFIX = /^\/skill:long-execute(?:\s|$)/;
const TICKET_PATTERN = /\b([a-z][a-z0-9-]*-\d{3})\b/i;
const CONTINUE_LABEL = "LONG EXECUTE CONTINUE";
const DEFAULT_MAX_TURNS = 6;

const CONTINUATION_PROMPT = `Continue long-execute for the same plan.

Re-read \`$SKILLS_ROOT/execute/SKILL.md\` and the current plan checklist, then take the next safe implementation or verification step.

Before ending with \`READY FOR REVIEW\`, audit the plan against the repository state:

- Re-read every unchecked or recently checked plan item.
- Verify each claimed completed item is actually implemented, not just partially started.
- Run the relevant verification for the completed phase.
- If any planned item is incomplete, continue working instead of declaring done.
- Do not mark checklist items complete unless the code/docs/tests already reflect them.

Use the existing long-execute end labels:
- \`READY FOR REVIEW\`
- \`BLOCKED — <reason>\`
- \`LONG EXECUTE CONTINUE\`

Do not use \`PENDING STEPS\` when safe implementation work remains.
The continue marker must be the entire final line exactly: \`LONG EXECUTE CONTINUE\`.

Do not summarize the whole session. Continue from the current repository state.`;

type LongExecuteState = {
	active: boolean;
	ticketId?: string;
	turnCount: number;
	maxTurns: number;
	updatedAt: number;
};

type CustomEntry = {
	type: string;
	customType?: string;
	data?: Partial<LongExecuteState>;
};

function initialState(): LongExecuteState {
	return { active: false, turnCount: 0, maxTurns: DEFAULT_MAX_TURNS, updatedAt: Date.now() };
}

function normalizeState(data?: Partial<LongExecuteState>): LongExecuteState {
	return {
		active: data?.active === true,
		ticketId: typeof data?.ticketId === "string" ? data.ticketId : undefined,
		turnCount: typeof data?.turnCount === "number" ? data.turnCount : 0,
		maxTurns: typeof data?.maxTurns === "number" ? data.maxTurns : DEFAULT_MAX_TURNS,
		updatedAt: typeof data?.updatedAt === "number" ? data.updatedAt : Date.now(),
	};
}

function findLatestState(entries: unknown[]): LongExecuteState {
	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i] as CustomEntry;
		if (entry?.type !== "custom" || entry.customType !== ENTRY_TYPE) continue;
		if (!entry.data || typeof entry.data !== "object") return initialState();
		return normalizeState(entry.data);
	}
	return initialState();
}

function persistState(pi: ExtensionAPI, nextState: LongExecuteState): LongExecuteState {
	const state = { ...nextState, updatedAt: Date.now() };
	pi.appendEntry(ENTRY_TYPE, state);
	return state;
}

function clearState(pi: ExtensionAPI, ctx: ExtensionContext, message?: string): LongExecuteState {
	const state = persistState(pi, initialState());
	if (message) ctx.ui.notify(message, "info");
	return state;
}

function ticketIdFrom(text: string): string | undefined {
	return text.match(TICKET_PATTERN)?.[1]?.toLowerCase();
}

function isAssistantMessage(message: AgentMessage): message is AssistantMessage {
	return message.role === "assistant" && Array.isArray(message.content);
}

function assistantText(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

function finalAssistantLines(messages: AgentMessage[]): string[] {
	const lastAssistant = [...messages].reverse().find(isAssistantMessage);
	if (!lastAssistant) return [];

	return assistantText(lastAssistant)
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

function finalNonEmptyAssistantLine(messages: AgentMessage[]): string | undefined {
	return finalAssistantLines(messages).at(-1);
}

function isStopLabel(label?: string): boolean {
	if (!label) return false;
	return label === "READY FOR REVIEW" || label === "NEEDS USER" || label === "PENDING STEPS" || label.startsWith("BLOCKED");
}

function isContinueLabel(label?: string): boolean {
	const trimmed = label?.trim();
	return trimmed === CONTINUE_LABEL;
}

function hasStopLabel(messages: AgentMessage[]): boolean {
	return finalAssistantLines(messages).some(isStopLabel);
}

export default function longExecute(pi: ExtensionAPI): void {
	let state = initialState();

	pi.registerCommand("long-execute-stop", {
		description: "Stop the active long-execute continuation loop",
		handler: async (_args, ctx) => {
			state = clearState(pi, ctx, "Long-execute stopped.");
		},
	});

	pi.registerCommand("long-execute-status", {
		description: "Show long-execute continuation status",
		handler: async (_args, ctx) => {
			if (!state.active) {
				ctx.ui.notify("Long-execute inactive.", "info");
				return;
			}

			const ticket = state.ticketId ? ` for ${state.ticketId}` : "";
			ctx.ui.notify(`Long-execute active${ticket}: ${state.turnCount}/${state.maxTurns} continuation turns used.`, "info");
		},
	});

	pi.on("input", async (event, ctx) => {
		if (event.source === "extension") {
			return { action: "continue" };
		}

		const trimmed = event.text.trim();
		if (LONG_EXECUTE_PREFIX.test(trimmed)) {
			state = persistState(pi, {
				active: true,
				ticketId: ticketIdFrom(trimmed),
				turnCount: 0,
				maxTurns: DEFAULT_MAX_TURNS,
				updatedAt: Date.now(),
			});
			ctx.ui.notify("Long-execute enabled.", "info");
			return { action: "continue" };
		}

		if (state.active) {
			state = clearState(pi, ctx, "Manual input clears active long-execute state.");
		}

		return { action: "continue" };
	});

	pi.on("agent_end", async (event, ctx) => {
		if (!state.active) return;

		const label = finalNonEmptyAssistantLine(event.messages);
		if (hasStopLabel(event.messages)) {
			state = clearState(pi, ctx, "Long-execute stopped.");
			return;
		}

		if (!isContinueLabel(label)) {
			state = clearState(pi, ctx, "Long-execute stopped: no continuation marker.");
			return;
		}

		if (state.turnCount + 1 >= state.maxTurns) {
			state = clearState(pi, ctx, "Long-execute stopped: max turns reached.");
			return;
		}

		state = persistState(pi, { ...state, turnCount: state.turnCount + 1 });
		pi.sendUserMessage(CONTINUATION_PROMPT, { deliverAs: "followUp" });
	});

	pi.on("session_start", async (event, ctx) => {
		if (event.reason === "new") {
			state = initialState();
			return;
		}

		if (event.reason === "fork") {
			state = clearState(pi, ctx, "Long-execute cleared in forked session.");
			return;
		}

		state = findLatestState(ctx.sessionManager.getBranch());
	});
}
