// Pure SPA — the page state is reconstructed entirely from localStorage at
// hydration time (tier, snapshots, settings, conversation history), and the
// server has no way to read any of it. Server-rendering would force every
// persisted pref to start at its in-code default, then pop to the saved
// value on mount: most visibly theme, background variant, tier, and the
// focus accordion. Disabling SSR here trades the empty-shell flash for a
// correct-on-first-paint experience.
export const ssr = false;
