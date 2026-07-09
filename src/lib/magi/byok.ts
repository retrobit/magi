import * as z from 'zod/mini';
import type { GatewayName } from './types';

/**
 * BYOK — bring-your-own-key. Visitors on a BYOK-enabled deployment can supply
 * their own provider API keys; a request may then use any gateway its keys
 * cover, on the visitor's own billing. This module is the shared contract
 * between the client (settings UI + request header) and the server (header
 * validation + tier-gate coverage): one schema, one header name, one shape.
 */

/** Request header carrying the visitor's keys as a small JSON object. */
export const BYOK_HEADER = 'x-magi-byok';

// Sanity bounds only — real validation is the provider accepting the key. The
// cap keeps a hostile header from smuggling bulk payloads through the field.
// Exported so the client can validate a single stored key field-by-field
// (tolerant load) rather than all-or-nothing.
export const byokKeySchema = z.string().check(z.trim(), z.minLength(8), z.maxLength(256));

/** One optional key per gateway; unknown fields are rejected outright. */
export const byokKeysSchema = z.strictObject({
	openrouter: z.optional(byokKeySchema),
	anthropic: z.optional(byokKeySchema),
	openai: z.optional(byokKeySchema),
	google: z.optional(byokKeySchema)
});

export type ByokKeys = z.infer<typeof byokKeysSchema>;

/** Display metadata for the settings UI, in the order the fields render. */
export const BYOK_GATEWAYS: ReadonlyArray<{
	gateway: GatewayName;
	label: string;
	placeholder: string;
}> = [
	{ gateway: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-…' },
	{ gateway: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-…' },
	{ gateway: 'openai', label: 'OpenAI', placeholder: 'sk-…' },
	{ gateway: 'google', label: 'Google', placeholder: 'AIza…' }
];
