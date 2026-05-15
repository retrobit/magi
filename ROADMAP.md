# Roadmap

Planned features, improvements, and known items for the MAGI project.

## Consensus Strategies

- **Structured Voting** — Each model scores the other two responses; majority wins.
- **Multi-Round Debate** — Models critique each other's answers iteratively until convergence.

## Temperaments

- **Consensus awareness** — Optionally tell the synthesis model that responses came from different dispositional lenses, so it can surface _why_ perspectives diverge (e.g. "the Rationalist and Individualist agree, but the Caretaker flags a human cost"). Would need its own toggle to avoid biasing the synthesizer.

## UI / UX

- **Conversation history** — Persist past queries and responses across sessions (localStorage or DB) so users can scroll back through prior MAGI interactions.
- **Conversation context** — Send prior turns to the models so they can reference earlier exchanges, turning MAGI into a multi-turn chat rather than isolated one-shots. The UI would show alternating user prompts and consensus responses; node panels show the three individual responses for the current turn only. **Caveats:** token usage multiplies ×3 per turn across all models, so this should be togglable (one-shot vs. retain context), warn the user about cumulative cost, and enforce a configurable cap on the number of retained rounds.
- **Syntax highlighting** — Add code block syntax highlighting in model panel markdown rendering.
- **Dark/light theme** — Toggle between dark and light themes.
- **Loading progress summary** — A consolidated "2/3 models responded" indicator visible at a glance, complementing the per-panel status icons.
- **Mobile layout** — Improve panel layout on narrow viewports (currently cramped on mobile).

## Model Management

- **Model health checks (hybrid registry)** — Keep the static curated registry for tier presets (that's the opinionated product), but add a runtime health check that probes models on startup or first use, marks dead ones, and falls back to alternates. This avoids dead-model surprises (like the StepFun/Arcee situation) without losing curation.
- **Full dynamic registry (optional, longer-term)** — Fetch available models from provider APIs at runtime instead of maintaining a static registry. **Caveats:** requires automatic tier classification (providers don't expose this consistently), filtering out irrelevant models (hundreds on OpenRouter), and handling API differences across providers (OpenRouter has a models endpoint; Anthropic/OpenAI/Google do not). Risk of turning MAGI into a generic model browser rather than an opinionated consensus tool.
- **Custom model entry** — Let users paste an arbitrary OpenRouter model ID rather than picking from the static registry. Covers the power-user case without full dynamic registry complexity.
- **Per-node model persistence** — Remember user's custom node assignments across sessions via localStorage.

## Clients

Build order matters here — each step forces the right abstraction for the next.

1. **CLI with TUI** _(build first)_ — Separate repo, consumes the MAGI API over HTTP/SSE. Split-pane streaming, interactive tier/temperament selection, piped input for scripting. npm-publishable (`npx magi`). **Why first:** works everywhere, easiest to demo/distribute, and proves the API is a complete client interface before investing in native.
2. **Native macOS app** _(build later)_ — Swift/SwiftUI, calls provider APIs directly (Anthropic, OpenAI, Google, OpenRouter) with consensus logic ported to Swift. No embedded server, no webview — a true native single binary. **Why later:** requires maintaining core logic in two languages (TS + Swift). Only worth it once the consensus engine and feature set stabilize.

**Architecture note:** Don't extract a `@magi/core` shared package yet. Build the CLI as a plain API consumer first. Once both clients exist and the real shared surface is clear, then extract — premature abstraction is worse than duplication.

## API

- **OpenAPI spec** — Machine-readable API description (JSON/YAML) for the existing `POST /api/magi` endpoint, enabling auto-generated clients, Swagger UI testing, and Postman import.
- **Webhook/callback mode** — Alternative to SSE for environments that don't support streaming.

## Infrastructure

- **Redis-backed rate limiter** — Replace the in-memory sliding-window rate limiter with a Redis-backed version that survives server restarts and works across multiple instances behind a load balancer.
- **Observability** — Structured logging and per-model latency metrics.
- **CI pipeline** — Automated test, lint, and type-check on pull requests.

## Developer Experience / Code Quality

- **Svelte 5 reactivity** — Replace `Map` and `Set` usage in `+page.svelte` (`tierCache`, `configuredNodes`) with `SvelteMap` and `SvelteSet` for idiomatic Svelte 5 fine-grained reactivity.
- **Unused imports** — Clean up `ModelEntry` in `MagiPanel.svelte` and `TIER_NAMES` in `TierSelector.svelte`.
- **`{@html}` ESLint suppression** — Add an inline disable comment for the intentional `{@html}` in `Markdown.svelte` (content is sanitized via DOMPurify).
