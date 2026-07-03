# Deploying the MAGI live demo (Vercel)

The public demo runs on **Vercel Hobby + Fluid Compute** via `adapter-vercel`. Fluid
Compute is the deciding feature: Multi-Round Debate (the default strategy) routinely
streams **>60 s** on slow free-tier models, and Fluid Compute raises the Hobby function
limit to **300 s** — enough to finish a long debate without a `504`/cutoff. (Cloudflare's
~100 s streaming cap is why it was rejected for this app.)

**Cost/abuse guards, in order of importance:**

1. **Tier gate** — in production without `MAGI_API_KEY`, only the **free / OpenRouter**
   tier is allowed; any paid-gateway request gets a `403`. (Already shipped.)
2. **Budget endpoint** — auto-locked in production unless `MAGI_API_KEY` is set.
   (Already shipped.)
3. **Rate limiter** — per-IP, 10 req / 60 s. Durable across the serverless fleet **only
   once Upstash is wired** (Part B); until then it's best-effort per-instance.

---

## Part A — Stand up a streaming preview (do this now)

Everything here works with the current `main`. Goal: a live URL that **streams** a
debate end-to-end.

### 1. Create the Vercel project

- Vercel → **Add New → Project** → import the GitHub repo `retrobit/magi`.
- Framework preset: **SvelteKit** (auto-detected). Leave build/install commands at their
  defaults — Vercel sees `bun.lock` and uses `bun install` + the SvelteKit build.

### 2. Environment variables (Production is what matters)

Set these for **Production**. Skip the Preview environment: Vercel's env-var UI wants
Preview values scoped to a branch, and this project only deploys `main` — a preview
deployment would merely render without the demo branding, which is harmless. Also note
Vercel's "`PUBLIC_` exposes this value to the browser" warning is expected for
`PUBLIC_DEMO_MODE` — exposing it is the point (it's a feature flag, value `true`); the
secret key below has no `PUBLIC_` prefix and stays server-only.

| Variable             | Value                                          | Notes                                                                                                                                                                                                                                                                                           |
| -------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OPENROUTER_API_KEY` | a **new, dedicated, revocable** OpenRouter key | Create at openrouter.ai → Keys, and **set a credit limit on it** in case the demo is abused. This is the only key the public demo needs.                                                                                                                                                        |
| `MAGI_API_KEY`       | **❌ do NOT set**                              | Inference (`POST /api/magi`) runs `checkApiKey`; setting this would lock out **visitors**, not just the budget endpoint. Leaving it unset is what enables the public-demo tier gate.                                                                                                            |
| `PUBLIC_DEMO_MODE`   | `true`                                         | Turns on the preview branding — the header **PREVIEW** chip, the splash badge, and the friendly free-tier-only guard (shake + transient note) on the tier selector. Public runtime flag read via `$env/dynamic/public`; unset → no preview chrome (use that for a private full-feature deploy). |

### 3. Enable Fluid Compute (required for long streams)

- Project → **Settings → Functions → Fluid Compute → On**.
- Without it, Hobby caps function duration at 60 s and long debates get cut off mid-stream.
  The `/api/magi` route already declares `maxDuration = 300` (see
  [src/routes/api/magi/+server.ts](src/routes/api/magi/+server.ts)); Fluid Compute is what
  lets that take effect.

### 4. Deploy + smoke-test the stream ⚠️ (the whole point of Part A)

After the deploy goes green, open the URL and:

- [ ] Run a **Multi-Round Debate on the Free tier**. Confirm tokens appear
      **progressively** (not one dump at the end) — that proves SSE streaming survives
      Vercel's proxy.
- [ ] Let a slow run go **past ~60 s** and confirm it **completes** (no `504`/`FUNCTION_INVOCATION_TIMEOUT`). If it dies at ~60 s, Fluid Compute isn't on.
- [ ] Try a **paid tier** (Frontier/Balanced) → must return **403** "Only the free tier is
      available on the public demo." (tier gate working).
- [ ] Hit `GET /api/magi/budget` → must return the disabled message (budget endpoint
      locked in prod).

If streaming works, Part A is done — you have a shareable preview. **Don't announce it
yet**; finish Part B first.

---

## Part B — Harden before going public (in progress)

These are landing in follow-up commits; this section will be finalized as each ships.

### Rate limiter → Upstash Redis

The in-memory limiter ([src/lib/server/rate-limit.ts](src/lib/server/rate-limit.ts)) is
per-instance and resets on cold start — useless across Vercel's fleet. It will be backed
by Upstash Redis (durable sliding window), auto-detected via env:

1. Vercel → **Storage → Create → Upstash Redis** (or create at upstash.com and copy the
   REST credentials). The Vercel integration sets these automatically:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
2. When both are present, rate limiting uses the durable store; when absent (local dev), it
   falls back to the in-memory limiter. No code change needed to switch.

### Content-Security-Policy

A full CSP (`script-src` / `style-src`) will be added via SvelteKit's `kit.csp`. Because a
wrong policy can render the SPA **blank with no build error**, it must be **smoke-tested in
a real browser on the preview** (a headless build can't catch it). The breakage-safe
headers (`nosniff`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) already
ship in [src/hooks.server.ts](src/hooks.server.ts).

### Client-IP verification

On Vercel, `getClientAddress()` resolves from the platform's forwarded headers. Verify on
the preview that distinct clients get **distinct** IPs (trip the 10 req/min limit from one
client → `429`; confirm a different network is independent) so the limiter buckets per
real caller rather than collapsing everyone into one.

---

## Promote to production

Once Part A streams cleanly **and** Part B's CSP renders correctly in a browser on the
preview, promote the deployment to production and announce.
