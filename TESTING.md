# Manual Testing Plan

This document covers manual testing for MAGI features that can't be verified by unit tests or type checking alone. Run through the relevant sections after making UI, streaming, or model-related changes.

## Automated tests

Run the full suite before manual testing — it covers the pure modules, the
`/api/magi` and `/api/magi/models` route handlers, and the Svelte components:

```bash
bun run verify   # check + lint + test:coverage + build — the same gate as CI
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
- [ ] All three panels transition from "Awaiting query..." to the pending state (a rotating loader verb)
- [ ] Streaming text appears in each panel as chunks arrive
- [ ] All three panels show green checkmark (success) when complete
- [ ] Consensus section shows a live "Waiting for MAGI — N / 3 responded…" progress line during model phase
- [ ] Consensus section shows its pending loader after models finish
- [ ] Consensus streams in and shows green checkmark when complete
- [ ] Copy button on consensus works

### Paid tiers (requires API keys)

- [ ] Switch to Balanced tier — panels update to show Anthropic/OpenAI/Google assignments
- [ ] Submit a query — all three direct-provider models respond
- [ ] Switch to Budget tier — models change to cheaper variants
- [ ] Switch to Frontier tier — models change to top-tier variants
- [ ] Switch back to Free — the previous Free conversation and seats come back

## 2. Temperaments

- [ ] Temperament toggle defaults to OFF
- [ ] Click the Temperament toggle (🧠) — it switches to ON with the subtle active state (faint tint + inset ring)
- [ ] Each panel shows its temperament badge (Rationalist, Caretaker, Individualist)
- [ ] Submit a query with temperaments ON — responses reflect dispositional lenses
- [ ] Toggle OFF — badges disappear
- [ ] Submit a query with temperaments OFF — responses are neutral/unstyled
- [ ] Switch tiers and back — the temperament toggle keeps its state (it is a global setting, not per tier)

## 3. Node Labels

- [ ] All panels show generic labels: "MAGI · 1", "MAGI · 2", "MAGI · 3"
- [ ] Node titles are non-interactive spans (no hover opacity, no click handler)
- [ ] Proper names (MELCHIOR / BALTHASAR / CASPAR) are hidden; to reveal them in
      dev, set `REVEAL_NODE_NAMES = true` in `src/lib/magi/types.ts`

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

- [ ] The consensus seat dropdown — labelled "Synthesizer" (Synthesis) or "Consolidator" (Multi-Round Debate), N/A for Voting and None — defaults to the first node
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

## 7. Abort

- [ ] While loading, Execute button becomes "Processing..." / hover shows "Abort"
- [ ] Clicking Abort stops all streaming immediately
- [ ] Panels freeze at their current state (no further chunks arrive)
- [ ] Can submit a new query after aborting

## 8. Per-tier state

- [ ] Submit a query on Free tier
- [ ] Switch to Balanced tier — Free results disappear, Balanced shows clean state
- [ ] Switch back to Free — the Free conversation (responses, consensus) and its seat assignments come back; an error banner from a turn that failed before streaming does not
- [ ] Cache is per-tier, not global

## 9. Strategies

- [ ] Structured Voting — a tally table shows each node's scores and the winner appears verbatim beneath it; no extra consensus-model call
- [ ] Multi-Round Debate — each node panel gains per-round entries, the consensus ends with a verdict line, and a converged debate stops before the round ceiling
- [ ] Strategy "None" — only the three raw answers appear, no consensus section
- [ ] Switching strategy and back keeps the toggles that don't apply showing "N/A" without losing their values

- [ ] Reasoning ON on the Free tier — while a model thinks before answering, its panel header shows "Thinking Ns" counting up, and it disappears when the answer starts or the run ends (Gemini seats think without a signal, so they never show it)
- [ ] Reasoning OFF on the Free tier — NVIDIA seats start answering within about a second; ERNIE and Flint still think (their reasoning is mandatory) and nothing errors. On a paid tier the toggle reads N/A, and switching back to Free shows the stored value

## 10. Per-node Retry

- [ ] A failed node shows a retry control; retrying re-runs only that node and the consensus is recomputed over all three answers
- [ ] The other two nodes' token counts do not change after the retry

## 11. Bring Your Own Key (needs `PUBLIC_BYOK_ENABLED=true`)

- [ ] The header key icon opens the API-keys popover; a pasted key survives a reload and is sent only as the `x-magi-byok` header
- [ ] With the key set, the tiers it covers become selectable

## 12. Responsive Layout

- [ ] Desktop (≥1024px): three panels side-by-side with swap buttons between them
- [ ] Below 1024px: panels stack vertically, swap buttons hidden
- [ ] Consensus section scrolls independently from panels
- [ ] Long responses don't overflow panels — each panel scrolls internally
