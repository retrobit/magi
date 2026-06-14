/** Optional deliberation directives, appended to model prompts when the matching
 *  toggle is on. Single-sourced so the phase-1 dispatch, the debate rounds, and
 *  the synthesizer all speak with one voice.
 *
 *  Opinionated — push each model to commit to a single answer on open-ended
 *  questions instead of hedging or listing equally-weighted options.
 *  Collaborative — push debaters to weigh their peers and lean toward genuine
 *  convergence (without caving). Only meaningful where models see each other,
 *  i.e. Multi-Round Debate. */
export const OPINIONATED_DIRECTIVE =
	'If this question is open-ended or has many defensible answers, do not hedge, equivocate, or present a ranked list of equally-weighted options. Commit to a single, specific answer and argue for it directly. You may acknowledge the strongest alternative in one sentence, but take a clear, definite position.';

export const COLLABORATIVE_DIRECTIVE =
	'Approach this as a collaboration aimed at convergence, not a contest. Engage your peers’ reasoning in good faith and move toward a shared answer when they make the better case — the goal is genuine agreement on the strongest answer. But do not be a pushover: hold a well-grounded position when the argument warrants it, and never agree merely to agree. Seek the strongest common ground over a hollow compromise.';
