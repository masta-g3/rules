import type { Api, Model } from "@earendil-works/pi-ai";
import { complete, type UserMessage } from "@earendil-works/pi-ai/compat";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

const SESSION_MODELS = [
	{ provider: "openai-codex", id: "gpt-5.3-codex-spark" },
	{ provider: "openai-codex", id: "gpt-5.6-luna" },
] as const;

export type ModelAuth = { model: Model<Api>; apiKey: string; headers?: Record<string, string> };
export type MetadataFailureKind = "authentication" | "unsupported" | "timeout" | "provider" | "response";
export type MetadataFailure = { kind: MetadataFailureKind; message: string };
export type MetadataAttempt = {
	model: string;
	latencyMs: number;
	outcome: "success" | "failure";
	failure?: MetadataFailure;
};
export type MetadataCallResult = {
	outcome: "success" | "failure";
	text?: string;
	model?: string;
	latencyMs: number;
	failure?: MetadataFailure;
	attempts: MetadataAttempt[];
	skippedModels: string[];
};
export type SessionModelCall = ((
	ctx: ExtensionContext,
	systemPrompt: string,
	text: string,
	maxTokens: 64 | 128,
) => Promise<MetadataCallResult>) & { reset?: () => void };

type CompleteCall = typeof complete;
type SessionModelDependencies = { complete?: CompleteCall; now?: () => number };

type ModelResolution = {
	models: ModelAuth[];
	found: number;
	authenticationFailures: number;
};

async function resolveSessionModelState(ctx: ExtensionContext, skipped = new Set<string>()): Promise<ModelResolution> {
	const models: ModelAuth[] = [];
	let found = 0;
	let authenticationFailures = 0;
	for (const candidate of SESSION_MODELS) {
		if (skipped.has(candidate.id)) continue;
		const model = ctx.modelRegistry.find(candidate.provider, candidate.id);
		if (!model) continue;
		found += 1;
		const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
		if (!auth.ok || !auth.apiKey) {
			authenticationFailures += 1;
			continue;
		}
		models.push({ model, apiKey: auth.apiKey, ...(auth.headers ? { headers: auth.headers } : {}) });
	}
	return { models, found, authenticationFailures };
}

export async function resolveSessionModels(ctx: ExtensionContext): Promise<ModelAuth[]> {
	return (await resolveSessionModelState(ctx)).models;
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function classifyMetadataError(error: unknown): MetadataFailure {
	const message = errorText(error);
	if (/not supported with a chatgpt account|unsupported model|model (?:is )?not supported|does not support/i.test(message)) {
		return { kind: "unsupported", message };
	}
	if (/timed? out|timeout|request was aborted|aborterror/i.test(message)) {
		return { kind: "timeout", message };
	}
	if (/\b401\b|\b403\b|unauthori[sz]ed|forbidden|auth(?:entication)? failed|api key|credentials?|\/login/i.test(message)) {
		return { kind: "authentication", message };
	}
	return { kind: "provider", message };
}

export function createSessionModelCall(dependencies: SessionModelDependencies = {}): SessionModelCall {
	const completeCall = dependencies.complete ?? complete;
	const now = dependencies.now ?? Date.now;
	let unsupportedModels = new Set<string>();

	const call: SessionModelCall = async (ctx, systemPrompt, text, maxTokens) => {
		const callStarted = now();
		const callUnsupportedModels = unsupportedModels;
		const skippedModels = [...callUnsupportedModels];
		let resolution: ModelResolution;
		try {
			resolution = await resolveSessionModelState(ctx, callUnsupportedModels);
		} catch (error) {
			return {
				outcome: "failure",
				latencyMs: Math.max(0, now() - callStarted),
				failure: classifyMetadataError(error),
				attempts: [],
				skippedModels,
			};
		}

		if (resolution.models.length === 0) {
			const failure: MetadataFailure = resolution.found > 0 && resolution.authenticationFailures === resolution.found
				? { kind: "authentication", message: "OpenAI Codex authentication is unavailable for the session metadata models." }
				: { kind: "unsupported", message: callUnsupportedModels.size > 0
					? "Every available session metadata model is unsupported for this account."
					: "No session metadata model is available in the local model registry." };
			return {
				outcome: "failure",
				latencyMs: Math.max(0, now() - callStarted),
				failure,
				attempts: [],
				skippedModels,
			};
		}

		const message: UserMessage = { role: "user", content: [{ type: "text", text }], timestamp: Date.now() };
		const attempts: MetadataAttempt[] = [];
		for (const auth of resolution.models) {
			const attemptStarted = now();
			try {
				const response = await completeCall(auth.model, { systemPrompt, messages: [message] }, {
					apiKey: auth.apiKey,
					...(auth.headers ? { headers: auth.headers } : {}),
					maxTokens,
					maxRetries: 0,
					cacheRetention: "none",
					reasoningEffort: "none",
					timeoutMs: 5_000,
				});
				const latencyMs = Math.max(0, now() - attemptStarted);
				if (response.stopReason !== "stop") {
					const failure = response.stopReason === "error" || response.stopReason === "aborted"
						? classifyMetadataError(response.errorMessage ?? `Model stopped with ${response.stopReason}.`)
						: { kind: "response" as const, message: response.errorMessage ?? `Model stopped with ${response.stopReason}.` };
					attempts.push({ model: auth.model.id, latencyMs, outcome: "failure", failure });
					if (failure.kind === "unsupported") callUnsupportedModels.add(auth.model.id);
					continue;
				}
				const resultText = response.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n");
				if (!resultText) {
					const failure: MetadataFailure = { kind: "response", message: "Model returned no text." };
					attempts.push({ model: auth.model.id, latencyMs, outcome: "failure", failure });
					continue;
				}
				attempts.push({ model: auth.model.id, latencyMs, outcome: "success" });
				return {
					outcome: "success",
					text: resultText,
					model: auth.model.id,
					latencyMs: Math.max(0, now() - callStarted),
					attempts,
					skippedModels,
				};
			} catch (error) {
				const latencyMs = Math.max(0, now() - attemptStarted);
				const failure = classifyMetadataError(error);
				attempts.push({ model: auth.model.id, latencyMs, outcome: "failure", failure });
				if (failure.kind === "unsupported") callUnsupportedModels.add(auth.model.id);
			}
		}

		const lastAttempt = attempts.at(-1);
		return {
			outcome: "failure",
			model: lastAttempt?.model,
			latencyMs: Math.max(0, now() - callStarted),
			failure: lastAttempt?.failure ?? { kind: "provider", message: "Session metadata request failed." },
			attempts,
			skippedModels,
		};
	};
	call.reset = () => { unsupportedModels = new Set<string>(); };
	return call;
}
