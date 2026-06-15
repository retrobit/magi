# MAGI demo recording

A deterministic, recorded walkthrough of the MAGI consensus app running a
**Multi-Round Debate** turn for the query _"Is it ethical to colonize Mars?"_.

The demo uses **no real model APIs**. The recording harness mocks the
`/api/magi` streaming (SSE) response in-page so the exact same scenario plays
every time, then records it with Playwright and encodes it to MP4 + GIF.

## Outputs (committed)

| File                       | What it's for                                                          |
| -------------------------- | ---------------------------------------------------------------------- |
| `docs/media/magi-demo.mp4` | H.264 / yuv420p / faststart — GitHub social preview, LinkedIn autoplay |
| `docs/media/magi-demo.gif` | 800px, 10 fps, optimized palette — inline README embed                 |

Representative still frames (splash, three-nodes-streaming, debate-rounds,
final-consensus) are written to `demo/frames/` during a run for review; they
are gitignored, not committed.

## How it works

The harness lives in `demo/` with its own `package.json` / `node_modules`,
fully separate from the app — it adds nothing to the app's `package.json` or
`src`. The single script `record.mjs`:

1. **Seeds `localStorage`** (`magi:prefs:v1`) so the app opens in the showcase
   state: `strategy: debate`, `palette: nebula`, `motionMode: full`,
   `bgVariant: off` (blank background for the recording), dark theme, generic node
   labels, Opinionated + Collaborative on. The payload matches the app's Zod
   persistence schema so it validates.
2. **Overrides `window.fetch`** (via `addInitScript`, before any app code runs)
   so a `POST /api/magi` returns a `Response` whose body is a `ReadableStream`
   that enqueues hand-authored SSE bytes with realistic per-token delays.

The mock emits bytes in the app's exact wire format —
`event: <name>\ndata: <json>\n\n` (see `src/lib/magi/stream-events.ts`) — and
follows the real Multi-Round Debate event flow (see
`src/lib/magi/consensus/debate.ts`):

```
config                          → node assignments (panel model labels)
model-chunk × N (interleaved)   → three nodes stream phase-1 answers in parallel
model-response + model-usage    → per node
consensus-chunk                 → "### 🗣️ Multi-Round Debate" + "Initial positions"
consensus-chunk + node-round    → per round: ledger line in consensus, revised
                                  answer routed to each node panel
consensus-chunk                 → "--- **Converged after 2 rounds …** ---" verdict
consensus-chunk                 → streamed final synthesized answer
consensus-complete (debateVerdict: 'consensus')
consensus-usage
run-stats
```

## Regenerate

Prereqs: `ffmpeg` on PATH, and Playwright's cached Chromium (the script
defaults to the macOS arm64 cache at
`~/Library/Caches/ms-playwright/chromium-<ver>`; override the full path with
`MAGI_CHROMIUM` on other platforms).

Record against a **production build** so the dev-only PerfOverlay and Debug
button don't appear:

```sh
# 1. Build and serve the app (production) from the repo root.
npm run build
npm run preview                   # serves http://localhost:4173

# 2. Install the harness deps (once).
cd demo && npm install

# 3. Record. MAGI_URL defaults to http://localhost:4173.
npm run record                    # → writes demo/video/*.webm and demo/frames/01..04.png

# 4. Encode (run from the repo root).
WEBM=$(ls -t demo/video/*.webm | head -1)

#   MP4 (H.264, yuv420p, faststart)
ffmpeg -y -i "$WEBM" -c:v libx264 -pix_fmt yuv420p -profile:v high \
  -level 4.1 -crf 20 -preset slow -movflags +faststart -an \
  docs/media/magi-demo.mp4

#   GIF (two-pass palette, 800px, 10fps, ~5 MB — the streaming text + node
#   colors are palette-heavy, so 10fps keeps it under the README-friendly size)
ffmpeg -y -i "$WEBM" -vf "fps=10,scale=800:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff" \
  demo/palette.png
ffmpeg -y -i "$WEBM" -i demo/palette.png \
  -lavfi "fps=10,scale=800:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  docs/media/magi-demo.gif
```

## Editing the scenario

All authored content (the query, the three phase-1 answers, the debate-round
ledger + revised answers, the verdict line, and the final synthesis) is at the
top of `record.mjs` as plain constants. Keep the consensus-stream markdown in
sync with the shapes produced by `src/lib/magi/consensus/debate.ts` (initial
positions list, `**Round N**` ledger blocks, the framed verdict line, the
`\n\n---\n\n` section rules) so the rendered panel matches a real debate.
