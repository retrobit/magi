# Roadmap

Planned features, improvements, and known items for the MAGI project.

## UI / UX

- **UI/UX overhaul — re-evaluate color use, geometric background, splash** — At the very least, audit the current use/overuse of color across the UI. The RGB-per-node identity is core, but everything _around_ it (buttons, accents, hover states, secondary chrome) should defer to it instead of competing. A primarily-blue accent scheme, for example, would clash with CASPAR's blue and dilute the three-MAGI signal — any new dominant hue has to be chosen with the RGB triad in mind. Likely direction: lead with neutral grays as the primary palette and reserve color almost entirely for the node identifiers themselves. Also: replace the aurora orbs / RGB columns with something more geometric (grids, hex meshes, isometric tiles) or pattern-based, and consider an animated ASCII intro / splash page that establishes the three-MAGI identity before the main UI hydrates. This is a larger redesign pass than the individual UI polish items above — break into a separate design exploration before committing to a direction. Update [[feedback-ui-design]] when the new direction lands.

## Infrastructure

- **Redis-backed rate limiter** — Replace the in-memory sliding-window rate limiter with a Redis-backed version that survives server restarts and works across multiple instances behind a load balancer.

## Model Management

- **Paid-tier model freshness** — Periodically verify the static registry against current provider model lineups (IDs, display names, context lengths). Last verified 2026-06-05 (internal consistency only — re-synced TIER_CONFIGS to match the post-2026-05-23 Gemini upgrades in the registry; full external re-check vs current provider docs still due).

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

## API

- **OpenAPI spec** — Machine-readable API description (JSON/YAML) for the existing `POST /api/magi` endpoint, enabling auto-generated clients, Swagger UI testing, and Postman import.
- **Webhook/callback mode** — Alternative to SSE for environments that don't support streaming.
