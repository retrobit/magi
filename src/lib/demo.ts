import { env } from '$env/dynamic/public';

/**
 * True on the public demo, where `PUBLIC_DEMO_MODE=true` is set in the Vercel
 * project env. Gates the demo chrome — the header DEMO chip, the splash badge,
 * and the free-tier-only guard on the tier selector. Unset (local dev, or a
 * private full-feature deployment) → false, so none of it shows.
 *
 * Read via `$env/dynamic/public` (not `static`): the value is optional, so a
 * missing var must resolve to undefined rather than fail the build. The page is
 * `ssr = false` but not prerendered, so the serverless function injects the
 * public env into the shell and this is readable client-side.
 */
export const DEMO_MODE = env.PUBLIC_DEMO_MODE === 'true';
