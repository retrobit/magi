# Deploying MAGI (Vercel)

The public demo runs at **[magi-consensus.vercel.app](https://magi-consensus.vercel.app)**
on **Vercel Hobby + Fluid Compute** via `adapter-vercel`. Fluid Compute is the deciding
feature: consensus runs on slow free-tier models can stream **>60 s**, and Fluid Compute
raises the Hobby function limit to **300 s** — enough to finish a long debate without a
`504`/cutoff. (Cloudflare's ~100 s streaming cap is why it was rejected for this app.)

**Cost/abuse guards, in order of importance — all shipped:**

1. **Tier gate** — in production without `MAGI_API_KEY`, only the **free / OpenRouter**
   tier is allowed; any paid-gateway request gets a `403`.
2. **Budget endpoint** — auto-locked in production unless `MAGI_API_KEY` is set.
3. **Rate limiter** — per-IP, 10 req / 60 s, durable across the serverless fleet via
   Upstash Redis (in-memory per-instance fallback when Redis is absent or unreachable).

---

## Branch & release model

Deploys are decoupled from `main` (since v1.0.3, 2026-07-18):

| Ref           | Role                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| `main`        | Integration branch. Every push builds a **preview deployment** (SSO-walled) — de facto staging.           |
| `production`  | Vercel's **Production Branch** (Settings → Git). Pushing this branch is _the_ deploy action.              |
| `vX.Y.Z` tags | Version markers + GitHub releases only. A version can be released without being deployed, and vice versa. |

- **Ship to production:** `git push origin main:production` (fast-forwards `production`
  to main), after the preview deployment checks out.
- **Deploy a specific version:** `git push origin vX.Y.Z^{}:production` (the `^{}` peels
  the annotated tag to its commit).
- **Roll back:** Vercel dashboard → the previous deployment → **Instant Rollback**; or
  push an older commit to `production` (a force-push — deliberate act, double-check).
- **Release order:** feature commits → `chore(release): vX.Y.Z` bump → tag + GitHub
  release → push `main` → promote to `production` when ready.

## Environment variables

Enable every variable for **Production _and_ Preview** — previews build from `main` and
need the same runtime keys (a var missing from Preview fails at request time, not build
time). The **Development** environment is inert for this project: local dev runs
`bun run dev` against `.env`, not `vercel dev`.

Vercel's "`PUBLIC_` exposes this value to the browser" warning is expected for
`PUBLIC_DEMO_MODE` — exposing it is the point (it's a feature flag); the secret keys have
no `PUBLIC_` prefix and stay server-only.

| Variable                                | Value                                     | Notes                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY`                    | a **dedicated, revocable** OpenRouter key | Created at openrouter.ai → Keys, **with a credit limit set** in case the demo is abused. The only key the public demo needs. If every node suddenly fails with a vague error, check this first — it has expired before.                                                                                                                                             |
| `MAGI_API_KEY`                          | **❌ do NOT set on the demo**             | Inference (`POST /api/magi`) runs `checkApiKey`; setting this would lock out **visitors**, not just the budget endpoint. Leaving it unset is what enables the public-demo tier gate.                                                                                                                                                                                |
| `PUBLIC_DEMO_MODE`                      | `true`                                    | Turns on the demo branding — the header **DEMO** chip, the splash badge, and the friendly free-tier-only guard (shake + transient note) on the tier selector. Public runtime flag read via `$env/dynamic/public`; unset → no demo chrome (use that for a private full-feature deploy).                                                                              |
| `PUBLIC_BYOK_ENABLED`                   | **❌ leave unset on the demo**            | BYOK — accept visitor-supplied provider keys. `true` adds an API-keys popover to the header (key icon) and makes the server honor the `x-magi-byok` header: covered gateways run on the visitor's billing, keyed callers get a 30 req/min bucket, and tiers their keys cover unlock even without operator keys. Set it on a full-production instance, not the demo. |
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | injected by the Upstash integration       | Vercel's Upstash integration injects **Vercel-KV-style** names — NOT the `UPSTASH_REDIS_REST_*` names in the standalone SDK docs. (`KV_REST_API_READ_ONLY_TOKEN` is also added but unused.) When present the durable limiter is used; when absent the in-memory fallback kicks in — auto-detected at runtime, no code change.                                       |

## Platform settings (live config)

- **Fluid Compute: On** (Settings → Functions) — required; without it Hobby caps
  functions at 60 s and long runs die mid-stream. `/api/magi` declares
  `maxDuration = 300` ([src/routes/api/magi/+server.ts](src/routes/api/magi/+server.ts));
  Fluid Compute is what lets that take effect. Runtime: `nodejs22.x`.
- **Production Branch: `production`** (Settings → Git).
- **Deployment Protection: Standard** — the production alias is public; preview
  deployments are SSO-walled to the account.
- **Web Analytics: enabled** (first-party `/_vercel/insights/*`, CSP-safe under `'self'`).

## Hardening notes (all shipped)

- **Rate limiter** — [src/lib/server/rate-limit.ts](src/lib/server/rate-limit.ts) uses
  `@upstash/ratelimit` (durable sliding window, 10 req / 60 s per IP; 30 req/min for
  BYOK-keyed callers). Client-IP distinctness was live-verified: one client tripping the
  limit gets `429`s while a different network stays independent.
- **BYOK** — enforced on **both** sides of the flag: when unset, the settings section
  doesn't render and the server ignores the `x-magi-byok` header outright, so the demo is
  unaffected even by hand-crafted requests. Visitor keys live in `localStorage`, ride the
  request header, are used in-flight only — never logged, never stored server-side.
- **CSP** — strict policy via SvelteKit's `kit.csp` in
  [svelte.config.js](svelte.config.js), **hash mode** (SvelteKit hashes its own inline
  bootstrap script so a bare `script-src 'self'` doesn't blank the SPA).
  `script-src`/`connect-src` are `'self'` only; `style-src` keeps `'unsafe-inline'` for
  Svelte `style:`/Tailwind runtime styles; `img-src` also allows `data:`.
  `src/lib/csp.invariants.test.ts` pins every directive against loosening. Breakage-safe
  headers (`nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) ship in
  [src/hooks.server.ts](src/hooks.server.ts).

## Smoke test after promoting to production

- [ ] Run a **Multi-Round Debate on the Free tier** — tokens must appear
      **progressively** (not one dump at the end), proving SSE streaming survives
      Vercel's proxy.
- [ ] Let a slow run go **past ~60 s** and confirm it **completes** (no
      `504`/`FUNCTION_INVOCATION_TIMEOUT`). Death at ~60 s means Fluid Compute is off.
- [ ] Try a **paid tier** (Frontier/Balanced) → must return **403** "Only the free tier
      is available on the public demo."
- [ ] Hit `GET /api/magi/budget` → must return the disabled message.
