// Shared bearer-token auth for MAGI API routes — opt-in via MAGI_API_KEY.
//
// When MAGI_API_KEY is unset, all routes pass through (dev-friendly default).
// When set, every protected route requires an `Authorization: Bearer <key>`
// header that matches via constant-time comparison.

import { env } from '$env/dynamic/private';
import { timingSafeEqual } from 'node:crypto';

/**
 * Returns null when the request is authorized (or auth is disabled), and a
 * 401 Response when the bearer token is missing or wrong.
 */
export function checkApiKey(request: Request): Response | null {
	if (!env.MAGI_API_KEY) return null;
	const authHeader = request.headers.get('authorization');
	const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
	if (!token || !safeCompare(token, env.MAGI_API_KEY)) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}
	return null;
}

function safeCompare(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) {
		// Still do a comparison to keep timing constant
		timingSafeEqual(bufA, bufA);
		return false;
	}
	return timingSafeEqual(bufA, bufB);
}
