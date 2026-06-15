/** The consensus output contract — a single, rigid Markdown skeleton every
 *  model-driven consensus path emits, so the final answer reads the same no
 *  matter which model or tier produced it. Single-sourced (like the directives
 *  in `deliberation.ts`) so synthesis and both debate branches stay in lockstep.
 *
 *  The skeleton is deliberately small — three level-2 sections — because weaker
 *  free-tier models follow a short, fixed structure far more reliably than an
 *  elaborate one. The middle section is the only part that changes: a unified
 *  answer reasons toward one verdict; a divided one lays the positions side by
 *  side without crowning a winner.
 *
 *  Voting does NOT use this — its consensus is the winning answer verbatim, so it
 *  carries its own code-generated header instead (see `voting.ts`). */

const PREAMBLE =
	'Format the entire response as GitHub-flavored Markdown with these three sections, each introduced by its exact level-2 heading, in this order. Write nothing before the first heading or after the last section, and do not add, rename, reorder, or omit a heading.';

const CONFIDENCE_UNIFIED =
	'## Confidence\nBegin with a single word — High, Medium, or Low — then one sentence on why, naming any unresolved uncertainty or perspective that was missing from this consensus.';

const CONFIDENCE_DIVIDED =
	'## Confidence\nBegin with a single word — High, Medium, or Low — reflecting confidence in the shared ground, then one sentence on what keeps the MAGI apart.';

const UNIFIED = `${PREAMBLE}

## Verdict
The bottom-line answer, stated directly in one to three sentences.

## Reasoning
The reasoning that supports the verdict, folding in the strongest points from each response. Do not walk through the responses one by one or simply concatenate them.

${CONFIDENCE_UNIFIED}`;

const DIVIDED = `${PREAMBLE}

## Verdict
State plainly that the MAGI are divided and capture the heart of the disagreement in one to three sentences. Do not pick a winner.

## Positions
Open with one sentence on what every side agrees on. Then give each distinct position its own bold lead-in line followed by the strongest case for it, with equal weight for every coalition — including a lone dissenter.

${CONFIDENCE_DIVIDED}`;

/** The output-format contract to append to a consensus synthesizer's system
 *  prompt. `divided` selects the lay-the-positions-side-by-side skeleton used
 *  when the debaters did not converge; otherwise the unified-answer skeleton. */
export function consensusFormat(divided = false): string {
	return divided ? DIVIDED : UNIFIED;
}
