# MAGI

Three AI models. One consensus.

Inspired by the MAGI system from Neon Genesis Evangelion — three independent supercomputers (MELCHIOR, BALTHASAR, CASPAR) that deliberate and reach consensus. This project sends your query to three competing frontier AI models in parallel, then synthesizes their responses into a unified answer.

## Architecture

```
User Query
    │
    ▼
┌─────────────────────────────┐
│       MAGI Orchestrator     │
│   (parallel dispatch)       │
└─────┬───────┬───────┬───────┘
      │       │       │
      ▼       ▼       ▼
 ┌────────┐ ┌────────┐ ┌────────┐
 │MELCHIOR│ │BALTHASR│ │ CASPAR │
 │Anthropic│ │ OpenAI │ │ Google │
 │ Claude  │ │  GPT   │ │ Gemini │
 └───┬────┘ └───┬────┘ └───┬────┘
     │          │          │
     ▼          ▼          ▼
┌─────────────────────────────┐
│     Consensus Engine        │
│   (pluggable strategies)    │
└─────────────┬───────────────┘
              │
              ▼
       Final Response
```

## Model Tiers

Users can select a tier to control quality vs. cost:

| Tier | Anthropic | OpenAI | Google |
|---|---|---|---|
| **Frontier** | Claude Opus 4.6 | GPT-5.2 | Gemini 3.1 Pro |
| **Balanced** | Claude Sonnet 4.6 | GPT-4o | Gemini 3 Flash |
| **Budget** | Claude Haiku 4.5 | GPT-4.1 mini | Gemini 3 Flash |

## Consensus Strategies

The consensus engine is pluggable. Available strategies:

- **Synthesis** — One model synthesizes the best answer from all three responses, noting agreements and disagreements.

Future strategies (planned):
- **Structured Voting** — Each model scores the other two responses; majority wins.
- **Multi-Round Debate** — Models critique each other's answers iteratively until convergence.

## Prerequisites

- [Bun](https://bun.sh) runtime
- API keys from:
  - [Anthropic](https://console.anthropic.com)
  - [OpenAI](https://platform.openai.com)
  - [Google AI Studio](https://aistudio.google.com)

## Setup

```bash
# Install dependencies
bun install

# Add your API keys
cp .env.local.example .env.local
# Edit .env.local with your keys

# Start dev server
bun run dev
```

## Project Structure

```
src/
├── routes/
│   ├── +page.svelte              # Main UI
│   ├── +layout.svelte            # Root layout
│   └── api/magi/
│       └── +server.ts            # Orchestration endpoint
├── lib/
│   ├── magi/
│   │   ├── models.ts             # Provider + tier config
│   │   ├── types.ts              # Shared types
│   │   └── consensus/
│   │       ├── types.ts           # ConsensusStrategy interface
│   │       ├── synthesis.ts       # Synthesis strategy
│   │       └── index.ts           # Strategy registry
│   └── components/
│       ├── MagiPanel.svelte       # Individual model response
│       ├── TierSelector.svelte    # Tier toggle
│       ├── StrategySelector.svelte # Consensus strategy toggle
│       └── ConsensusView.svelte   # Consensus display
```

## Stack

- **Runtime**: Bun
- **Language**: TypeScript
- **Framework**: SvelteKit
- **AI SDK**: Vercel AI SDK
- **Styling**: Tailwind CSS
