import type { AvailableModel, GatewayName } from '$lib/magi/types';

interface OpenRouterApiModel {
	id: string;
	name: string;
	context_length?: number;
	pricing?: { prompt?: string; completion?: string };
}

const CACHE_TTL = 10 * 60_000;
let cachedModels: AvailableModel[] | null = null;
let cachedAt = 0;

function extractProvider(modelId: string): string {
	return modelId.split('/')[0] ?? modelId;
}

function cleanDisplayName(raw: string): string {
	return raw.replace(/\s*\(free\)\s*$/i, '').replace(/^[^:]+:\s*/, '');
}

export async function getOpenRouterFreeModels(): Promise<AvailableModel[]> {
	const now = Date.now();
	if (cachedModels && now - cachedAt < CACHE_TTL) {
		return cachedModels;
	}

	try {
		const res = await fetch('https://openrouter.ai/api/v1/models');
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = (await res.json()) as { data: OpenRouterApiModel[] };

		cachedModels = data.data
			.filter((m) => m.id.endsWith(':free'))
			.map((m) => ({
				id: m.id,
				gateway: 'openrouter' as GatewayName,
				provider: extractProvider(m.id),
				displayName: cleanDisplayName(m.name),
				contextLength: m.context_length
			}))
			.sort((a, b) => a.provider.localeCompare(b.provider));

		cachedAt = now;
		return cachedModels;
	} catch {
		return cachedModels ?? [];
	}
}

export const _testing = {
	clearCache: () => {
		cachedModels = null;
		cachedAt = 0;
	}
};
