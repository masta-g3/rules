import type { Api, Model } from "@earendil-works/pi-ai";
import { complete, type UserMessage } from "@earendil-works/pi-ai/compat";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const PREFERRED = { provider: "openai-codex", id: "gpt-5.3-codex-spark" } as const;
export type ModelAuth = { model: Model<Api>; apiKey: string; headers?: Record<string, string> };

async function authFor(ctx: ExtensionContext, model: Model<Api> | undefined): Promise<ModelAuth | undefined> {
	if (!model) return undefined;
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok || !auth.apiKey) return undefined;
	return { model, apiKey: auth.apiKey, ...(auth.headers ? { headers: auth.headers } : {}) };
}

export async function resolveSessionModels(ctx: ExtensionContext): Promise<ModelAuth[]> {
	const preferred = await authFor(ctx, ctx.modelRegistry.find(PREFERRED.provider, PREFERRED.id));
	const active = ctx.model && `${ctx.model.provider}/${ctx.model.id}` !== `${PREFERRED.provider}/${PREFERRED.id}`
		? await authFor(ctx, ctx.model)
		: undefined;
	return [preferred, active].filter((item): item is ModelAuth => Boolean(item));
}

export async function boundedModelCall(
	ctx: ExtensionContext,
	systemPrompt: string,
	text: string,
	maxTokens: 64 | 128,
): Promise<string | undefined> {
	const message: UserMessage = { role: "user", content: [{ type: "text", text }], timestamp: Date.now() };
	let models: ModelAuth[];
	try { models = await resolveSessionModels(ctx); } catch { return undefined; }
	for (const auth of models) {
		try {
			const response = await complete(auth.model, { systemPrompt, messages: [message] }, {
				apiKey: auth.apiKey,
				...(auth.headers ? { headers: auth.headers } : {}),
				maxTokens,
				maxRetries: 0,
				cacheRetention: "none",
				timeoutMs: 2_500,
			});
			if (response.stopReason !== "stop") continue;
			const text = response.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n");
			if (text) return text;
		} catch { /* one active-model fallback is allowed */ }
	}
	return undefined;
}
