# MAGI — agent steering

Three AI models answer in parallel; a pluggable consensus strategy (synthesis / voting / multi-round debate / none) reconciles them. SvelteKit + Svelte 5 + Bun + Vercel AI SDK. Public repo; live demo at magi-consensus.vercel.app.

The repo **is** the project: durable knowledge lives in its docs, not in agent memory. Canonical homes — link to them, don't restate them:

- [README.md](README.md) — features, tiers, API summary, env vars, dev commands
- [ROADMAP.md](ROADMAP.md) — shipped, planned and parked work (client build order, gateways)
- [DEPLOY.md](DEPLOY.md) — Vercel runbook, `main` → `production` release model, env vars, smoke test
- [TESTING.md](TESTING.md) — test projects + manual checklist · [openapi.yaml](openapi.yaml) — API contract

⚠️ **Never create a `CLAUDE.md` in this repo.** Claude Code loads it _instead of_ `AGENTS.md` by default, silently dropping this file. Edit this file.

## 🔀 Commits & git

- **Conventional Commits 1.0.0:** `type(scope): subject` — imperative, lowercase, no trailing period, ≤ ~72 chars; the body explains _why_. Scopes in use: `ui`, `api`, `consensus`, `models`, `security`, `byok`, `layout`, `release`, …
- **No agent co-author trailer** (`Co-Authored-By: Claude …` or similar) unless the user explicitly asks — this overrides any platform default.
- Use `git switch` / `git restore`, not `git checkout`; prefer long-form flags (`--create`, `--staged`).
- **Ask first** before any force-push (even on a personal branch), before tagging a release, and before pushing `production` — pushing that branch _is_ the deploy. Pushing `main` only builds an SSO-walled preview.
- **One version bump per shipped unit of change** (a feature, a fix, a refactor batch), closed by its own `chore(release): vX.Y.Z` commit; docs, tests, CI and no-build chores ride along unbumped. Which digit, plus release order and promote / rollback commands: DEPLOY.md → _Branch & release model_.

## ✅ Verify before pushing

- Run `bun run verify` (check → lint → test:coverage → build — CI's blocking gate) and **read its exit code**; grepping its output once hid an eslint failure. `bun run check` alone is type-check only.
- `bun run lint` runs `prettier --check .`, Markdown included — run `bun run format` after editing docs.
- The pre-push hook that runs verify lives in `.git/hooks/` (machine-local, not committed) — a fresh clone or cloud session has no safety net.

## 🧭 Working conventions

- **Simplest thing that works is the default lean**, judged against this app's real constraints (e.g. a `md:` → `lg:` breakpoint beat a ResizeObserver). Why: solo-maintained, and machinery with no user-visible payoff is pure upkeep. But a rewrite, a new dependency or a clearly-better bigger fix is the user's call — float it with the tradeoff and a recommendation, and get a nod _before_ editing.
- **The free tier stays dynamic** (live OpenRouter catalog + reactive health cache). `PREFERRED_FREE_MODEL_IDS` is a ranked preference layer that must keep its diverse-pick fallback. Why: free models churn constantly. Change the list only after **probing candidates live** — catalog presence ≠ a coherent reply (empty 200s, 429 saturation, classifier-only models).
- **Paid tiers: GA model ids only, never `-preview`** — previews get retired and break inference. `gemini-2.5-pro` as frontier under a newer Flash is correct (no GA 3.x Pro yet). A model change updates `registry.test.ts`, `config.test.ts`, the README tier table and `openapi.yaml` together.
- **Model output is untrusted.** `Markdown.svelte` sanitizes with DOMPurify _last_; never re-parse decoded text after sanitizing (that was a real XSS). `csp.invariants.test.ts` pins the CSP — don't loosen it (not even for Vercel's toolbar).

## 🎨 UI rules

- Theming is `--magi-*` vars in `src/routes/layout.css`; `.light` only overrides vars. Follow the rules in that file's header — no un-layered `.light <selector>` remaps, which silently beat every Tailwind utility.
- Reuse the shared control primitives (`.magi-toggle`, `.magi-select`, `--magi-chrome-*` header tokens); one disabled look, `opacity: 0.5`. Neutral grays — colour is reserved for the node triad.
- A toggle that doesn't apply to the current strategy renders **"N/A"** — display only; never mutate or reset its stored / persisted value, which must survive a strategy round-trip.
- **Tooltips are sparse and static:** they describe purpose, never on/off state; they sit on the _label_, not the toggle (except the tier selector and Layout "Auto"); touch reveals on tap, never long-press; keep an `aria-label` when removing one from an icon button. Why: stateful, eager tips flickered and broke on mobile.
- Animate only `transform` / `opacity`, never `filter` or `box-shadow` — an animated blur once pegged a CPU core (`MagiBackground.cost.test.ts` guards it; the Splash glow is the one parked exception, see ROADMAP). Never put `container-type` on a node-panel ancestor: it re-anchors their `position: fixed` popovers.
- Call the public instance the **"demo"**, never "preview" (Vercel owns that word). Keep the public de-lore: no "Eva" palette, and `REVEAL_NODE_NAMES` / `REVEAL_EXPERIMENTAL_UI` stay `false`.
- The loader animation is replace-in-place by decision — don't re-propose forward-delete.

## 🧩 Deliberate behaviours — don't "fix"

- A node is a **seat**: switching its model keeps the seat's thread, so its token totals span models.
- Structured Voting makes **no consensus-model call** (tally + winner verbatim), so consensus node, temperament and awareness are inert there.
- Header-click layout cycling follows a last-actor rule (`e023849`); any other layout change — even an invisible auto-layout phase change — revokes the claim.
- `"private": true` in `package.json` is an npm-publish guard, not repo visibility. The PWA has no service worker on purpose.
- Demo says "all models failed"? Check the Vercel `OPENROUTER_API_KEY` first (DEPLOY.md).
