# Roadmap

Planned features, improvements, and known items for the MAGI project.

## Consensus Strategies

- **Multi-Round Debate** — Models critique each other's answers iteratively until convergence.

## UI / UX

- **Promote the stats panel out of dev mode** — The 📊 panel is currently `import.meta.env.DEV`-gated and only covers voting. Surface it for every user, label the button "STATS", and broaden the breakdowns: wins/usage by **gateway**, **provider**, **model**, **node**, and **strategy** (including the existing Structured Voting breakdown).
- **Strategy dropdown tooltips** — Explain how each consensus strategy works on hover over its option in the dropdown (Synthesis vs Structured Voting vs future Multi-Round Debate). Helps a first-time user pick without leaving for the README.
- **Temperament tooltips** — Hovering over a node's temperament badge (🧊 Rationalist / 🛡️ Caretaker / 🔥 Individualist) should pop a short explainer with the guiding question, so users learn the system without having to consult the README.
- **Stats panel respects `genericLabels`** — The 📊 panel currently hard-codes `MELCHIOR / BALTHASAR / CASPAR`, ignoring the user's MAGI 1/2/3 vs proper-name preference. Should mirror what the rest of the UI is showing.
- **Budget readout: indent items under the section heading** — The other settings sections (Theme, Background, Auto-scroll) indent their options slightly under the section label; the Budget rows currently sit flush left, so the section reads as visually flatter than its neighbors. Match the surrounding pattern.
- **Snap-to-top: snap on submit, to the blank line above the prompt** — Currently Snap-to-top fires when a panel's latest response finishes streaming, and jumps each panel to the start of that response. Should instead fire **immediately on submit** (so the user's eye lands at the new turn before any tokens arrive), and snap to the **empty line above the prompt display**, not the response — so the prompt itself is the first thing the user reads at the top of the viewport.
- **Reserve the conversation-header row** — The header strip with the **New conversation** button + turn count + total tokens currently mounts only after the first prompt is sent, which shifts the entire UI down. Render it from the start with the button disabled and the numeric figures shown as placeholders (e.g. `Turns —` / `Tokens —`) so first-prompt submission doesn't reflow the layout.
- **Consensus panel gradient glow brightness parity** — The inset/border glow on the consensus panel reads as dimmer than the matching glows on the three node panels next to it. Likely a color/opacity/blur mismatch in the consensus-panel styles vs the node-panel styles. Audit the gradient stops + glow opacity in `layout.css` (or the relevant component) and bring the consensus panel up to the same perceived brightness.
- **Playful loading verbs while nodes + consensus stream** — Borrow the Claude Code idiom: a small rotating verb beside the spinner ("Thinking…", "Pondering…", "Cogitating…", "Deliberating…") that cycles every ~2s while a node is waiting for its first token or while the consensus is being synthesized/tallied. Per-MAGI lists could lean into each node's temperament (Rationalist verbs vs Caretaker verbs vs Individualist verbs); the consensus panel could pull from a strategy-aware list (`Synthesizing…` vs `Tallying…` vs `Debating…`).
- **UI/UX overhaul — re-evaluate color use, geometric background, splash** — At the very least, audit the current use/overuse of color across the UI. The RGB-per-node identity is core, but everything _around_ it (buttons, accents, hover states, secondary chrome) should defer to it instead of competing. A primarily-blue accent scheme, for example, would clash with CASPAR's blue and dilute the three-MAGI signal — any new dominant hue has to be chosen with the RGB triad in mind. Likely direction: lead with neutral grays as the primary palette and reserve color almost entirely for the node identifiers themselves. Also: replace the aurora orbs / RGB columns with something more geometric (grids, hex meshes, isometric tiles) or pattern-based, and consider an animated ASCII intro / splash page that establishes the three-MAGI identity before the main UI hydrates. This is a larger redesign pass than the individual UI polish items above — break into a separate design exploration before committing to a direction. Update [[feedback-ui-design]] when the new direction lands.

## Infrastructure

- **Redis-backed rate limiter** — Replace the in-memory sliding-window rate limiter with a Redis-backed version that survives server restarts and works across multiple instances behind a load balancer.

## Model Management

- **Paid-tier model freshness** — Periodically verify the static registry against current provider model lineups (IDs, display names, context lengths). Last verified 2026-05-19.
- **Provider budget readout — Anthropic & OpenAI admin APIs** — The readout already ships with OpenRouter live and a graceful "unavailable" status for the rest. Next step: actually call Anthropic's `/v1/organizations/cost_report` and OpenAI's `/v1/organization/usage/...` when `ANTHROPIC_ADMIN_KEY` / `OPENAI_ADMIN_KEY` are configured, instead of returning the "coming soon" placeholder.

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
