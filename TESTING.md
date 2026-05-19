# Manual Testing Plan

This document covers manual testing for MAGI features that can't be verified by unit tests or type checking alone. Run through the relevant sections after making UI, streaming, or model-related changes.

## Automated tests

Run the full suite before manual testing — it covers the pure modules, the
`/api/magi` and `/api/magi/models` route handlers, and the Svelte components:

```bash
bun run test     # vitest, both projects
bun run check    # svelte-check / type checking
bun run lint     # prettier + eslint
```

Vitest runs two projects (configured in `vite.config.ts`): a **server** project
(Node environment) for route and module tests, and a **client** project (jsdom)
for `*.svelte.test.ts` component tests.

## Prerequisites

```bash
bun run dev
```

Open http://localhost:5173/ in a browser with DevTools console visible.

## 1. Basic Query Flow

### Free tier (default)

- [ ] Page loads with Free tier selected and all three node panels visible
- [ ] Type a query and click Execute
- [ ] All three panels transition from "Awaiting query..." to "Thinking..." (pending state)
- [ ] Streaming text appears in each panel as chunks arrive
- [ ] All three panels show green checkmark (success) when complete
- [ ] Consensus section shows a live "Waiting for MAGI — N / 3 responded…" progress line during model phase
- [ ] Consensus section shows "Synthesizing consensus..." after models finish
- [ ] Consensus streams in and shows green checkmark when complete
- [ ] Copy button on consensus works

### Paid tiers (requires API keys)

- [ ] Switch to Balanced tier — panels update to show Anthropic/OpenAI/Google assignments
- [ ] Submit a query — all three direct-provider models respond
- [ ] Switch to Budget tier — models change to cheaper variants
- [ ] Switch to Frontier tier — models change to top-tier variants
- [ ] Switch back to Free — previous Free tier results are restored from cache

## 2. Temperaments

- [ ] Temperament toggle defaults to OFF
- [ ] Click the brain icon — toggle switches to ON with indigo highlight
- [ ] Each panel shows its temperament badge (Rationalist, Caretaker, Individualist)
- [ ] Submit a query with temperaments ON — responses reflect dispositional lenses
- [ ] Toggle OFF — badges disappear
- [ ] Submit a query with temperaments OFF — responses are neutral/unstyled
- [ ] Switch tiers and back — temperament toggle state is preserved per tier

## 3. Node Labels

- [ ] Panels default to EVA names: "MELCHIOR", "BALTHASAR", "CASPAR"
- [ ] Click any node label — all three panels swap to "MAGI" generic labels
- [ ] Consensus "Synthesized by" dropdown also updates to match
- [ ] Click again — labels revert to EVA names
- [ ] Label toggle is independent of tier switching (global preference)

## 4. Node Configuration

- [ ] Gateway dropdown shows available gateways for the current tier
- [ ] Changing gateway updates provider and model dropdowns
- [ ] Provider dropdown is disabled for direct gateways, enabled for OpenRouter
- [ ] Providers already used by other nodes are grayed out
- [ ] Gateways where all providers are taken are grayed out
- [ ] Shuffle button randomizes to an eligible model
- [ ] Swap buttons between panels exchange their configurations (not their names)
- [ ] All dropdowns are disabled while a query is loading

## 5. Consensus Node Selection

- [ ] "Synthesized by" dropdown defaults to the first node
- [ ] Changing it before a query works — consensus uses the selected node's model
- [ ] Changing it is disabled during loading

## 6. Error Handling

### Model failure

- [ ] If a model fails, its panel shows centered "Model unavailable" with error detail
- [ ] Panel header shows red alert icon
- [ ] Other panels continue streaming normally
- [ ] Consensus section shows partial-consensus warning ("Only N of 3 models responded")
- [ ] Consensus still synthesizes from available responses

### Network / server errors

- [ ] Disconnect network mid-query — error banner appears, panels stop gracefully
- [ ] Submit with invalid JSON (via API) — 400 error response
- [ ] Rapid-fire 11+ requests — 429 rate limit response

## 7. Abort

- [ ] While loading, Execute button becomes "Processing..." / hover shows "Abort"
- [ ] Clicking Abort stops all streaming immediately
- [ ] Panels freeze at their current state (no further chunks arrive)
- [ ] Can submit a new query after aborting

## 8. Tier Caching

- [ ] Submit a query on Free tier
- [ ] Switch to Balanced tier — Free results disappear, Balanced shows clean state
- [ ] Switch back to Free — previous Free results are fully restored (responses, consensus, errors, assignments, temperament toggle)
- [ ] Cache is per-tier, not global

## 9. Responsive Layout

- [ ] Desktop (>768px): three panels side-by-side with swap buttons between them
- [ ] Narrow viewport: panels stack vertically, swap buttons hidden
- [ ] Consensus section scrolls independently from panels
- [ ] Long responses don't overflow panels — each panel scrolls internally
