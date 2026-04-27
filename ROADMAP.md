# Roadmap

Planned features, improvements, and known items for the MAGI project.

## Consensus Strategies

- **Structured Voting** — Each model scores the other two responses; majority wins.
- **Multi-Round Debate** — Models critique each other's answers iteratively until convergence.

## Temperaments

- **Consensus awareness** — Optionally tell the synthesis model that responses came from different dispositional lenses, so it can surface _why_ perspectives diverge (e.g. "the Rationalist and Individualist agree, but the Caretaker flags a human cost"). Would need its own toggle to avoid biasing the synthesizer.

## Developer Experience / Code Quality

- **Svelte 5 reactivity** — Replace `Map` and `Set` usage in `+page.svelte` (`tierCache`, `configuredNodes`) with `SvelteMap` and `SvelteSet` for idiomatic Svelte 5 fine-grained reactivity.
- **Unused imports** — Clean up `ModelEntry` in `MagiPanel.svelte` and `TIER_NAMES` in `TierSelector.svelte`.
- **`{@html}` ESLint suppression** — Add an inline disable comment for the intentional `{@html}` in `Markdown.svelte` (content is sanitized via DOMPurify).
