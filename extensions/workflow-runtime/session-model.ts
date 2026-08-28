import type { Api, Model } from "@earendil-works/pi-ai";
import { complete, type UserMessage } from "@earendil-works/pi-ai/compat";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const SESSION_MODELS = [
	{ provider: "openai-codex", id: "gpt-5.3-codex-spark" },
	{ provider: "openai-codex", id: "gpt-5.6-luna" },
] as const;
export type ModelAuth = { model: Model<Api>; apiKey: string; headers?: Record<string, string> };

async function authFor(ctx: ExtensionContext, model: Model<Api> | undefined): Promise<ModelAuth | undefined> {
	if (!model) return undefined;
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok || !auth.apiKey) return undefined;
	return { model, apiKey: auth.apiKey, ...(auth.headers ? { headers: auth.headers } : {}) };
}

export async function resolveSessionModels(ctx: ExtensionContext): Promise<ModelAuth[]> {
	const models: ModelAuth[] = [];
	for (const candidate of SESSION_MODELS) {
		const auth = await authFor(ctx, ctx.modelRegistry.find(candidate.provider, candidate.id));
		if (auth) models.push(auth);
	}
	return models;
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
		} catch { /* try the next bounded metadata model */ }
	}
	return undefined;
}
