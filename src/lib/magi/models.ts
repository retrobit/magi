import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { env } from '$env/dynamic/private';
import type { ByokKeys } from './byok';
import type { GatewayName } from './types';

let _anthropic: ReturnType<typeof createAnthropic>;
let _openai: ReturnType<typeof createOpenAI>;
let _google: ReturnType<typeof createGoogleGenerativeAI>;
let _openrouter: ReturnType<typeof createOpenAI>;

function requireKey(name: string): string {
	const key = env[name];
	if (!key) throw new Error(`Missing environment variable: ${name}`);
	return key;
}

// OpenRouter uses HTTP-Referer + X-Title for attribution on its rankings/
// dashboards. Defaults point at the canonical repo, but deployed instances
// should override via env so traffic isn't misattributed to upstream.
function createOpenRouterClient(apiKey: string) {
	return createOpenAI({
		apiKey,
		baseURL: 'https://openrouter.ai/api/v1',
		headers: {
			'HTTP-Referer': env.OPENROUTER_REFERER || 'https://github.com/retrobit/magi',
			'X-Title': env.OPENROUTER_TITLE || 'MAGI'
		}
	});
}

// Throwaway client for a visitor-supplied (BYOK) key — deliberately NEVER
// cached in the singletons below, so one caller's key can't bleed into another
// request served by the same warm instance.
function createByokClient(gateway: GatewayName, apiKey: string) {
	switch (gateway) {
		case 'anthropic':
			return createAnthropic({ apiKey });
		case 'openai':
			return createOpenAI({ apiKey });
		case 'google':
			return createGoogleGenerativeAI({ apiKey });
		case 'openrouter':
			return createOpenRouterClient(apiKey);
	}
}

function getClient(gateway: GatewayName) {
	switch (gateway) {
		case 'anthropic':
			return (_anthropic ??= createAnthropic({ apiKey: requireKey('ANTHROPIC_API_KEY') }));
		case 'openai':
			return (_openai ??= createOpenAI({ apiKey: requireKey('OPENAI_API_KEY') }));
		case 'google':
			return (_google ??= createGoogleGenerativeAI({
				apiKey: requireKey('GOOGLE_GENERATIVE_AI_API_KEY')
			}));
		case 'openrouter':
			return (_openrouter ??= createOpenRouterClient(requireKey('OPENROUTER_API_KEY')));
	}
}

/**
 * Resolve a model handle. A visitor's BYOK key for the gateway takes precedence
 * over the operator's env key, and the env var may be entirely absent for a
 * BYOK-covered gateway — a deployment that never configured its own Anthropic
 * key still serves Anthropic models to callers who bring one.
 */
export function getModel(gateway: GatewayName, modelId: string, byok?: ByokKeys) {
	const byokKey = byok?.[gateway];
	const client = byokKey ? createByokClient(gateway, byokKey) : getClient(gateway);
	if (gateway === 'openrouter') return (client as ReturnType<typeof createOpenAI>).chat(modelId);
	return client(modelId);
}
