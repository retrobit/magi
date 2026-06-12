import { generateText } from 'ai';
import {
	nodeIdentities,
	type ConsensusStrategy,
	type ConsensusContext,
	type ConsensusEvent,
	type VotingStats,
	type VotingJurorBreakdown,
	SECTION_RULE
} from './types';
import { NODE_LABELS, NODE_LABELS_GENERIC } from '../types';
import type { MagiNodeName, MagiResponse } from '../types';
import { makePeerOrderer } from './peer-order';

interface Candidate {
	label: string;
	response: MagiResponse;
}

interface JurorScore {
	juror: MagiNodeName;
	score: number;
}

interface Tally {
	response: MagiResponse;
	scores: JurorScore[];
	total: number;
	best: number;
}

function buildJurorPrompt(query: string, candidates: Candidate[], lens?: string): string {
	const blocks = candidates.map((c) => `Candidate ${c.label}:\n${c.response.text}`).join('\n\n');
	const format = candidates
		.map((c) => `${c.label}: <score 0-10> — <one-sentence reason>`)
		.join('\n');
	const instructions = `Several AI models answered the same question. Score each candidate answer from 0 to 10, weighing accuracy, completeness, clarity, and usefulness. Judge substance, not length or style.

Question:
${query}

${blocks}

Reply with exactly one line per candidate, in this format and nothing else:
${format}`;
	// A temperament lens shapes how this juror weighs the answers. It describes
	// only the juror's own disposition — never the candidates' — so the A/B
	// anonymity holds.
	return lens ? `${lens}${SECTION_RULE}${instructions}` : instructions;
}

// Round and clamp a raw score into the 0–10 band a juror was asked for.
function clampScore(n: number): number {
	return Math.max(0, Math.min(10, Math.round(n)));
}

// Pull a "<label>: <score>" figure for each candidate out of a juror's reply.
// Plain text (not structured output) so it works on every model, including
// free-tier ones that don't support JSON-schema generation. Tolerant of
// bullets, bold markers, and ':' / ')' / '-' / '.' separators.
function parseJurorScores(text: string, candidates: Candidate[]): Map<string, number> {
	const scores = new Map<string, number>();
	for (const { label } of candidates) {
		const match = text.match(
			new RegExp(`(?:^|[\\s*])${label}\\*{0,2}\\s*[:).\\-]\\s*\\*{0,2}(\\d{1,2})`, 'im')
		);
		if (match) scores.set(label, clampScore(Number(match[1])));
	}
	return scores;
}

function buildVoteMarkdown(
	ranked: Tally[],
	anyScored: boolean,
	labels: Record<MagiNodeName, string>,
	jurorErrors: string[]
): string {
	const winner = ranked[0];
	if (!anyScored) {
		const reason = jurorErrors[0]
			? `\n\n> No juror produced a usable score — ${jurorErrors[0]}`
			: '';
		return `### 🗳️ Structured vote\n\nNo scores were returned — defaulting to ${labels[winner.response.node]}.${reason}${SECTION_RULE}${winner.response.text}`;
	}
	const max = winner.scores.length * 10;
	const heading = `### 🗳️ Structured vote — ${labels[winner.response.node]} wins (${winner.total} / ${max})`;
	const rows = ranked
		.map((t) => {
			const detail = t.scores.length
				? t.scores.map((s) => `${labels[s.juror]} (${s.score})`).join(' · ')
				: '—';
			return `| ${labels[t.response.node]} | ${t.total} | ${detail} |`;
		})
		.join('\n');
	const table = `| Response | Score | Juror scores |\n| --- | --- | --- |\n${rows}`;
	return `${heading}\n\n${table}${SECTION_RULE}${winner.response.text}`;
}

export const votingStrategy: ConsensusStrategy = {
	name: 'voting',
	description: 'Each model scores its peers and the highest-scoring response becomes the consensus',

	async *execute(ctx: ConsensusContext): AsyncIterable<ConsensusEvent> {
		const {
			responses,
			query,
			getModel,
			nodeAssignments,
			consensusTemperament,
			synthesizerAwareness,
			genericLabels,
			signal,
			tier,
			peerOrderSeed
		} = ctx;
		const labels = genericLabels ? NODE_LABELS_GENERIC : NODE_LABELS;
		const modelOf = (node: MagiNodeName): string =>
			nodeAssignments.find((a) => a.node === node)?.modelId ?? 'unknown';
		// This turn's seat order — rotates which peer is Candidate A/B so the
		// position bias doesn't always favour the same node. Identity (node order)
		// when no seed is supplied. Fixed for the whole vote, so every juror agrees.
		const orderPeers = makePeerOrderer(responses, peerOrderSeed);

		// With a single response there is nothing to vote on — it wins outright.
		if (responses.length <= 1) {
			const text = responses[0]
				? `### 🗳️ Structured vote\n\nOnly ${labels[responses[0].node]} responded — no vote was held.${SECTION_RULE}${responses[0].text}`
				: 'No responses were available to vote on.';
			yield { type: 'text-delta', text };
			yield { type: 'complete', fullText: text };
			yield { type: 'usage', inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
			if (responses[0]) {
				const sole = responses[0];
				const totals = Object.fromEntries(responses.map((r) => [r.node, 0])) as Record<
					MagiNodeName,
					number
				>;
				const lengths = Object.fromEntries(responses.map((r) => [r.node, r.text.length])) as Record<
					MagiNodeName,
					number
				>;
				const models = Object.fromEntries(
					responses.map((r) => [r.node, modelOf(r.node)])
				) as Record<MagiNodeName, string>;
				yield {
					type: 'run-stats',
					stats: {
						strategy: 'voting',
						tier: tier ?? 'unknown',
						synthesizerAwareness: synthesizerAwareness ?? false,
						consensusTemperament: consensusTemperament ?? false,
						nodes: nodeIdentities(responses, nodeAssignments),
						voting: {
							winner: sole.node,
							winnerModel: modelOf(sole.node),
							winnerTotal: 0,
							tiebreak: 'walkover',
							totals,
							lengths,
							models,
							jurors: [],
							positionBias: { avgA: 0, avgB: 0, n: 0 }
						}
					}
				};
			}
			return;
		}

		// Each responding node is a juror: it scores its peers, anonymized as A/B,
		// so it can't favour (or recognise) a known sibling. Its own answer is
		// withheld. Juror calls run in parallel.
		const jurorRuns = await Promise.allSettled(
			responses.map(async (juror) => {
				const assignment = nodeAssignments.find((a) => a.node === juror.node);
				if (!assignment) throw new Error(`No assignment for juror ${juror.node}`);
				const candidates: Candidate[] = orderPeers(
					responses.filter((r) => r.node !== juror.node)
				).map((response, i) => ({ label: String.fromCharCode(65 + i), response }));
				// Jurors always score neutrally — they're instructed to judge substance,
				// so no temperament lens is applied (consensus temperament is inert for
				// voting; a dispositional lens would bias an otherwise objective tally).
				const { text, usage } = await generateText({
					model: getModel(assignment.gateway, assignment.modelId),
					prompt: buildJurorPrompt(query, candidates),
					abortSignal: signal
				});
				return { juror: juror.node, candidates, text, usage };
			})
		);

		// Tally: collect the scores each response received from its jurors. A
		// juror whose call failed or whose reply had no readable scores adds none.
		const received = new Map<MagiNodeName, JurorScore[]>();
		for (const r of responses) received.set(r.node, []);
		const jurorErrors: string[] = [];
		// Per-juror, per-candidate-letter score grid — preserves the A/B
		// position so we can compute position bias later. A juror only ever sees
		// two candidates, so each entry has at most A and B.
		const jurorBreakdown: VotingJurorBreakdown[] = [];
		// Running totals for position-bias: average score given to Candidate A
		// vs Candidate B across every juror's reply.
		let aSum = 0;
		let aCount = 0;
		let bSum = 0;
		let bCount = 0;
		let inputTokens = 0;
		let outputTokens = 0;
		let cachedInputTokens = 0;

		for (const run of jurorRuns) {
			if (run.status !== 'fulfilled') {
				jurorErrors.push(run.reason instanceof Error ? run.reason.message : String(run.reason));
				continue;
			}
			const { juror, candidates, text, usage } = run.value;
			inputTokens += usage.inputTokens ?? 0;
			outputTokens += usage.outputTokens ?? 0;
			cachedInputTokens += usage.cachedInputTokens ?? 0;
			const parsed = parseJurorScores(text, candidates);

			// Always record the breakdown, even when nothing parsed — the absence
			// is itself signal ("MELCHIOR returned nothing readable this turn").
			const candA = candidates.find((c) => c.label === 'A');
			const candB = candidates.find((c) => c.label === 'B');
			const aScore = candA && parsed.has('A') ? (parsed.get('A') as number) : null;
			const bScore = candB && parsed.has('B') ? (parsed.get('B') as number) : null;
			if (candA) {
				jurorBreakdown.push({
					juror,
					jurorModel: modelOf(juror),
					candidateA: { node: candA.response.node, score: aScore },
					...(candB && { candidateB: { node: candB.response.node, score: bScore } })
				});
			}
			if (aScore !== null) {
				aSum += aScore;
				aCount += 1;
			}
			if (bScore !== null) {
				bSum += bScore;
				bCount += 1;
			}

			if (parsed.size === 0) {
				jurorErrors.push(`${juror} returned no readable scores`);
				continue;
			}
			for (const [label, score] of parsed) {
				const candidate = candidates.find((c) => c.label === label);
				if (candidate) received.get(candidate.response.node)?.push({ juror, score });
			}
		}

		// Winner: highest total. Ties fall to the best single score, then — via a
		// stable sort over node-ordered `responses` — to node order.
		const ranked: Tally[] = responses
			.map((response) => {
				const scores = received.get(response.node) ?? [];
				return {
					response,
					scores,
					total: scores.reduce((sum, s) => sum + s.score, 0),
					best: scores.reduce((m, s) => Math.max(m, s.score), 0)
				};
			})
			.sort((a, b) => b.total - a.total || b.best - a.best);

		const anyScored = ranked.some((t) => t.scores.length > 0);
		const markdown = buildVoteMarkdown(ranked, anyScored, labels, jurorErrors);
		yield { type: 'text-delta', text: markdown };
		yield { type: 'complete', fullText: markdown };
		yield { type: 'usage', inputTokens, outputTokens, cachedInputTokens };

		// Determine which mechanism actually picked the winner — useful signal
		// for "is MELCHIOR winning on merit or by sitting first in node order?"
		const winnerTally = ranked[0];
		const runnerUp = ranked[1];
		let tiebreak: VotingStats['tiebreak'] = 'none';
		if (runnerUp && winnerTally.total === runnerUp.total) {
			tiebreak = winnerTally.best > runnerUp.best ? 'best-score' : 'node-order';
		}

		const totals = Object.fromEntries(ranked.map((t) => [t.response.node, t.total])) as Record<
			MagiNodeName,
			number
		>;
		const lengths = Object.fromEntries(responses.map((r) => [r.node, r.text.length])) as Record<
			MagiNodeName,
			number
		>;
		const models = Object.fromEntries(responses.map((r) => [r.node, modelOf(r.node)])) as Record<
			MagiNodeName,
			string
		>;

		const voting: VotingStats = {
			winner: winnerTally.response.node,
			winnerModel: modelOf(winnerTally.response.node),
			winnerTotal: winnerTally.total,
			tiebreak,
			totals,
			lengths,
			models,
			jurors: jurorBreakdown,
			positionBias: {
				avgA: aCount > 0 ? aSum / aCount : 0,
				avgB: bCount > 0 ? bSum / bCount : 0,
				n: aCount + bCount
			}
		};
		yield {
			type: 'run-stats',
			stats: {
				strategy: 'voting',
				tier: tier ?? 'unknown',
				synthesizerAwareness: synthesizerAwareness ?? false,
				consensusTemperament: consensusTemperament ?? false,
				nodes: nodeIdentities(responses, nodeAssignments),
				voting
			}
		};
	}
};
