# Roadmap

Planned features, improvements, and known items for the MAGI project.

## UI / UX

- **UI/UX overhaul** ✅ **shipped 2026-06-09 → 06-10** — var-driven theme architecture, cursor-reactive hex-mesh background, node-identity tinting, config-collapse chips, error-lifecycle rework, and the animated ASCII intro / splash (`Splash.svelte` — three concepts: decode, boot, convergence; plays on every page load; only the `decode` concept is reachable in the UI — boot/convergence remain in code for the `?splash=` dev preview; header mark replays it, any key/click skips, reduced-motion safe).
- **Auto-layout** ✅ **shipped 2026-06-14** — The layout focus control gained a leading **Auto** segment (🪄, now the default). In Auto mode the layout follows the run lifecycle: node panels expand while generating → snaps to Balanced when the consensus streams alongside still-working nodes (debate rounds) → snaps to Consensus-expanded as soon as every MAGI is done, even while the consensus is still streaming. Any manual segment disarms Auto; clicking Auto re-enables it. Persisted; stays disarmed on page load so a restored conversation doesn't yank the layout; New conversation resets to Balanced. Respects reduced-motion.
- **Default auto-scroll changed to Follow** ✅ **shipped 2026-06-14** — Follow (keep latest streamed content in view; manual scroll-up pauses until bottom is reached) is now the first option and the default, replacing Snap to top. Order in settings: Follow → Snap to top → Off.
- **Toggle-label width fix** ✅ **shipped 2026-06-14** — ON/OFF toggle labels (Temperament / Opinionated / Collaborative) are now fixed-width so the control row doesn't reflow when they flip.
- **Touch-target / WCAG 2.5.8 sizing pass** ⏸️ _deferred — post-1.0_ — Several interactive controls (config chips, toggles, layout segments) sit below the 24×24 CSS-px minimum target size. A full 40px pass was built and reverted (2026-06-20) as a visual-density regression; the right approach is likely invisible hit-area expansion (padding / `::after` extension) rather than growing the controls. Explicitly parked until after v1.0.0 (decision 2026-07-08) — noted here so it isn't lost, not a release blocker.

## Infrastructure

- **Redis-backed rate limiter** ✅ **shipped 2026-07-06** — `@upstash/ratelimit` sliding window on Upstash Redis (Vercel-KV env names), durable across the serverless fleet, with automatic per-instance in-memory fallback when the store is absent or unreachable.
- **Strict CSP + security headers** ✅ **shipped 2026-07-07** — Hash-based Content-Security-Policy (`kit.csp`, `default-src 'self'`) with `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy` set in `hooks.server.ts`. Browser-verified on the live demo (render, export, copy all work under the policy).
- **BYOK — bring-your-own-key** ✅ **shipped 2026-07-08** — Behind `PUBLIC_BYOK_ENABLED` (unset on the demo): visitors paste their own provider keys in settings; tiers unlock for the gateways their keys cover, on their own billing, with a larger rate-limit bucket. Keys are browser-local, sent per-request, never logged or stored server-side.

## Model Management

- **Paid-tier model freshness** — Periodically verify the static registry against current provider model lineups (IDs, display names, context lengths). Last verified 2026-07-05 against each provider's live `/v1/models` (balanced → Claude Sonnet 5; README/openapi frontier synced to Opus 4.8).
- **Free-tier preferred defaults** — `PREFERRED_FREE_MODEL_IDS` (config.ts) is a ranked good-list of distinct-provider models that seat first on the free tier. Refresh it by **probing candidates live** (catalog presence isn't enough — some models return empty 200s or only handle code) and keep providers distinct. Last refreshed 2026-07-10 (dropped dead `poolside/laguna-xs.2`, expanded trio → ranked five).

## Temperaments

- **Per-node temperament customization** ✅ **shipped 2026-06-14** — A ✏️ pencil button next to the TEMPERAMENT toggle opens an editor where each seat's name and persona text are editable in place. Blank fields fall back to the built-in default; each seat has a "Reset to \<default\>" action. Custom names appear in the node panel's temperament badge; the hover tooltip shows the full custom persona. Customizations are stored sparsely in `localStorage` and validated server-side. Built-in defaults remain Rationalist / Caretaker / Individualist.
- **Truthful, dynamic synthesis lens (awareness)** ✅ **shipped 2026-06-14** — When Temperament Awareness is on, the synthesis prompt names the actual lens each node used this turn — its real label and persona, resolved from the live config (`resolveNodeTemperament`, custom-aware) and threaded through `ConsensusContext.customTemperaments`. No hard-coded persona names and no guessing: it reflects the truth and stays correct when personas are customized.

## Clients

Build order matters here — each step forces the right abstraction for the next.

1. **CLI with TUI** _(build first)_ — Separate repo, consumes the MAGI API over HTTP/SSE. Split-pane streaming, interactive tier/temperament selection, piped input for scripting. npm-publishable (`npx magi`). **Why first:** works everywhere, easiest to demo/distribute, and proves the API is a complete client interface before investing in native.
2. **Native macOS app** _(build later)_ — Swift/SwiftUI, calls provider APIs directly (Anthropic, OpenAI, Google, OpenRouter) with consensus logic ported to Swift. No embedded server, no webview — a true native single binary. **Why later:** requires maintaining core logic in two languages (TS + Swift). Only worth it once the consensus engine and feature set stabilize.

**Architecture note:** Don't extract a `@magi/core` shared package yet. Build the CLI as a plain API consumer first. Once both clients exist and the real shared surface is clear, then extract — premature abstraction is worse than duplication.

## Gateways

Support more model routers beyond OpenRouter. The dynamic model discovery pattern (`GET /api/magi/models`) already supports this — each new gateway needs a fetcher module like `openrouter.ts` and an AI SDK client in `models.ts`.

**Candidates:**

| Gateway                                                                | Free tier?       | Discovery API?                 | Fit | Notes                                                   |
| ---------------------------------------------------------------------- | ---------------- | ------------------------------ | --- | ------------------------------------------------------- |
| [Portkey](https://portkey.ai)                                          | ✅ Limited       | ✅ 1,600+ models               | 🟢  | Unified catalog, observability, routing rules           |
| [AI/ML API](https://aimlapi.com)                                       | ✅ Credits       | ✅ OpenAI-compatible `/models` | 🟢  | 400+ models across text/image/audio, one key            |
| [LiteLLM](https://github.com/BerriAI/litellm)                          | ✅ Self-hosted   | ✅ `/model/info`               | 🟢  | Open source, zero markup, 100+ providers                |
| [Eden AI](https://www.edenai.co)                                       | ✅ Pay-as-you-go | ✅ Model listing               | 🟡  | Broader than LLMs (OCR, speech), GDPR-native            |
| [Together AI](https://together.ai)                                     | Trial credits    | ✅ `/models`                   | 🟡  | Open-source models only — no Anthropic/OpenAI relay     |
| [Cloudflare AI Gateway](https://developers.cloudflare.com/ai-gateway/) | ✅ Free plan     | ❌ No discovery                | 🟠  | Pass-through/cache layer, not a model router            |
| [Bifrost](https://github.com/maximhq/bifrost)                          | ✅ Self-hosted   | ❌ Config-driven               | 🟠  | 11µs overhead — ultra-low latency, no dynamic discovery |
