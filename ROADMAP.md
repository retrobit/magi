# Roadmap

Planned features, improvements, and known items for the MAGI project.

## Recently shipped

- **Multi-turn conversation** — Follow-up queries with per-node own-thread context and a consensus thread; scrollable per-turn transcripts; conversations persist per-tier in `localStorage`.
- **Token tracking** — Per-node input/output counts, cumulative totals, and per-model context-window budget gauges with warnings.
- **Per-node model persistence** — Custom node/model assignments saved per tier and restored across sessions.
- **UI polish** — Light-theme contrast pass, background "off" option, consistent error cards, mobile panel height caps.

## Consensus Strategies

- **Structured Voting** — Each model scores the other two responses; majority wins.
- **Multi-Round Debate** — Models critique each other's answers iteratively until convergence.

## Infrastructure

- **CI pipeline** — Automated test, lint, and type-check on pull requests.
- **Redis-backed rate limiter** — Replace the in-memory sliding-window rate limiter with a Redis-backed version that survives server restarts and works across multiple instances behind a load balancer.
- **Observability** — Structured logging and per-model latency metrics.
- **Test coverage** — `persistence.ts`, `rate-limit.ts`, and the `history` validation schema are currently untested; component and API-route coverage is absent.
- **Dev debug panel** — A dev-only panel to inject model errors and inflate token counts, for exercising error and context-limit UI states.

## UI / UX

- **Syntax highlighting** — Add code block syntax highlighting in model panel markdown rendering.
- **Loading progress summary** — A consolidated "2/3 models responded" indicator visible at a glance, complementing the per-panel status icons.
- **Streaming auto-scroll** — Optionally keep node and consensus panels pinned to the latest streamed text (toggleable).
- **Mobile layout** — Panels stack and scroll with a height cap on narrow viewports; further polish (typography, spacing) still welcome.

## Model Management

- **Paid-tier model freshness** — Periodically verify the static registry against current provider model lineups (IDs, display names, context lengths). `gpt-5.2`'s context length is currently an estimate.

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
