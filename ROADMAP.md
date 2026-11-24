# Roadmap

Planned features, improvements, and known items for the MAGI project.

## UI / UX

- **UI/UX overhaul** ✅ **shipped 2026-06-09 → 06-10** — var-driven theme architecture, cursor-reactive hex-mesh background, node-identity tinting, config-collapse chips, error-lifecycle rework, and the animated ASCII intro / splash (`Splash.svelte` — the MAGI wordmark decoding out of noise; plays on every page load; header mark replays it, any key/click skips, reduced-motion safe). Two further concepts, boot and convergence, were built alongside but were not reachable from the UI in any release (only via a `?splash=` URL parameter) and were removed in v1.0.6 (2026-11-23) — `git show 4746317:src/lib/components/Splash.svelte` has them if wanted.
- **Auto-layout** ✅ **shipped 2026-06-14** — The layout focus control gained a leading **Auto** segment (🪄, now the default). In Auto mode the layout follows the run lifecycle: node panels expand while generating → snaps to Balanced when the consensus streams alongside still-working nodes (debate rounds) → snaps to Consensus-expanded as soon as every MAGI is done, even while the consensus is still streaming. Any manual segment disarms Auto; clicking Auto re-enables it. Persisted; stays disarmed on page load so a restored conversation doesn't yank the layout; New conversation resets to Balanced. Respects reduced-motion.
- **Default auto-scroll changed to Follow** ✅ **shipped 2026-06-14** — Follow (keep latest streamed content in view; manual scroll-up pauses until bottom is reached) is now the first option and the default, replacing Snap to top. Order in settings: Follow → Snap to top → Off.
- **Toggle-label width fix** ✅ **shipped 2026-06-14** — ON/OFF toggle labels (Temperament / Opinionated / Collaborative) are now fixed-width so the control row doesn't reflow when they flip.
- **Touch-target / WCAG 2.5.8 sizing pass** ⏸️ _deferred — post-1.0_ — Several interactive controls (config chips, toggles, layout segments) sit below the 24×24 CSS-px minimum target size. A full 40px pass was built and reverted (2026-06-20) as a visual-density regression; the right approach is likely invisible hit-area expansion (padding / `::after` extension) rather than growing the controls. Explicitly parked until after v1.0.0 (decision 2026-07-08) — noted here so it isn't lost, not a release blocker.

## Infrastructure

- **Redis-backed rate limiter** ✅ **shipped 2026-07-06** — `@upstash/ratelimit` sliding window on Upstash Redis (Vercel-KV env names), durable across the serverless fleet, with automatic per-instance in-memory fallback when the store is absent or unreachable.
- **Strict CSP + security headers** ✅ **shipped 2026-07-07** — Hash-based Content-Security-Policy (`kit.csp`, `default-src 'self'`) with `X-Frame-Options`, `X-Content-Type-Options`, and `Referrer-Policy` set in `hooks.server.ts`. Browser-verified on the live demo (render, export, copy all work under the policy).
- **BYOK — bring-your-own-key** ✅ **shipped 2026-07-08** — Behind `PUBLIC_BYOK_ENABLED` (unset on the demo): visitors paste their own provider keys in settings; tiers unlock for the gateways their keys cover, on their own billing, with a larger rate-limit bucket. Keys are browser-local, sent per-request, never logged or stored server-side.

## Model Management

- **Paid-tier model freshness** — Periodically verify the static registry against current provider model lineups (IDs, display names, context lengths). Fastest ground truth: query each provider's live `/v1/models` directly, and wire GA ids only. Last verified 2026-11-23 (v1.0.8 Google, v1.0.9 Anthropic + OpenAI), every seat checked with a real request through the app except `gemini-4-carbon` (paid-tier only; the local key's project has no billing). Current lineup: frontier Opus 5.5 / GPT-6.2 Astra / Gemini 4 Carbon; balanced Sonnet 5.5 / GPT-6.2 Sol / Gemini 4 Hydrogen; budget Haiku 5.5 / GPT-6 Luna / Gemini 3.5 Flash Lite. Every current paid model reasons before answering (Gemini 4 and the GPT-6 tiers can't turn it off), so time to first token is now seconds, not milliseconds. Decisions: **Claude Fable as frontier stays declined** (2× Opus 5.5's price and a 30-day-retention requirement — not worth it for a tier the public demo doesn't expose; re-checked for Fable 5.2); OpenAI's frontier seat costs 2× the other two because OpenAI has nothing current at Opus/Carbon's price; GPT-6 Luna, not Terra, is the budget seat because it matches Haiku 5.5's price.
- **Free-tier preferred defaults** — `PREFERRED_FREE_MODEL_IDS` (config.ts) is a ranked good-list that seats first on the free tier, with diverse-pick backfill when entries are missing from the live pool. Reliability outranks provider diversity here: preferred models seat even when they repeat a provider, and `validateConfig`'s provider-uniqueness rule covers direct-gateway seats only (router seats are exempt). Refresh it by **probing candidates live** — catalog presence isn't enough (some models return empty 200s, 429 under load, or only handle code). Last refreshed 2026-11-23 (v1.0.5, then v1.0.12): all 12 free models probed with 7–10 real requests each; the Gemma seats had been returning 429 on every attempt since at least 2026-10-04, and two of the five July picks had left the catalog. Most free models now reason before answering (16–62 s of silence on a hard prompt); since v1.0.10 the route gives every call 120 s to its first answer token (stall windows: DEPLOY.md → Operations), which made Flint and ERNIE usable, so the top three now come from three providers (NVIDIA, Baidu, Recursive). _Open:_ NVIDIA endpoints accept `reasoning: { effort: "none" }` (first token in under a second) but the app has no way to send it yet; OpenRouter also supports per-request fallback lists (`models: [...]`) that would hand a rate-limited seat to the next model. _Considered, not built:_ key the preference on providers (which churn slowly) instead of exact model ids, picking each provider's best current free model from the live pool.

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

## Parked & considered

Assessed and deliberately not scheduled — recorded so they aren't re-litigated from scratch.

- **Loader-animation dedup** — `MagiPanel` and `ConsensusView` each carry their own loader wiring around `loaderFrame` (the follow-scroll core is already shared via `scroll.svelte.ts`). Available as a cleanup.
- **Voting jurors are history-blind** — on follow-up turns, jurors score only the current answers (`voting.ts` takes no history). Giving them history would change voting output, so it's left as-is.
- **BYOK keyed bucket** — the 30 req/min bucket is granted when a valid `x-magi-byok` header is present, not when its keys actually cover the request. Checking coverage first would move work ahead of the rate limit; left as-is.
- **Rate limit ∥ body read** — parallelizing the limiter round-trip with the body read was rejected: the limiter deliberately runs before the body is parsed, so an over-limit caller costs nothing.
- **Splash glow animates `filter: drop-shadow`** — the one remaining exception to the animate-only-`transform`/`opacity` rule; it's a single non-looping pulse on load.
- **Move `stripSummaryTail` / `debateVerdictLine` from `debate.ts` to `format.ts`** — would keep the AI SDK out of the browser bundle by structure rather than by tree-shaking. Low value, import churn.
- **Stall-guard end-to-end test** — `createStallGuard` (src/lib/server/stall-guard.ts) has unit tests; a route-level test over a stalled stream with fake timers is flaky-prone, so it's skipped.
- **Runtime idle-CPU test (Playwright)** — rejected: heavy (browser binaries, a new test project, CI wiring), flaky, and still blind to compositor/GPU cost. `MagiBackground.cost.test.ts` guards that regression class deterministically.
