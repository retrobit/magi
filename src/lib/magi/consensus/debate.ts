import { generateText, streamText, type ModelMessage } from 'ai';
import {
	nodeIdentities,
	type ConsensusStrategy,
	type ConsensusContext,
	type ConsensusEvent,
	type DebateStats,
	SECTION_RULE
} from './types';
import {
	NODE_LABELS,
	NODE_LABELS_GENERIC,
	NODE_TEMPERAMENTS,
	type MagiNodeName,
	type DebateVerdict
} from '../types';
import { TEMPERAMENT_SYSTEM_PROMPTS } from '../temperaments';
import { markCacheBreakpoint } from '../prompt-cache';
import { makePeerOrderer } from './peer-order';

// Upper bound on debate rounds. Each round is one model call per responding node;
// the debate stops early once a round produces no material change (convergence),
// so most runs use fewer. The final synthesis pass is one additional call.
const MAX_ROUNDS = 3;

interface UsageTotals {
	inputTokens: number;
	outputTokens: number;
	cachedInputTokens: number;
}

interface DebaterReply {
	/** Did this debater materially revise its answer this round? */
	changed: boolean;
	/** This debater's stance toward each peer, positional: index 0 is Peer A, 1 is
	 *  Peer B — the same order the peers were presented in. `true`/`false` when the
	 *  debater stated it, `null` when it didn't (treated as "no signal", never as
	 *  agreement). A bare "yes"/"no" with no per-peer breakdown applies to all peers. */
	agree: (boolean | null)[];
	/** One-line gist of what changed / why it held — shown in the consensus ledger. */
	note: string;
	/** The full revised answer (or the prior answer when nothing parsed). */
	answer: string;
}

// A peer as one debater sees it: its current answer plus, from round two on, the
// rationale it gave last round. Anonymized as Peer A/B so debaters weigh the
// argument, not the identity (the same anonymity the voting jurors get).
interface PeerView {
	answer: string;
	note?: string;
}

// Anonymized peer labels — every reference to a peer (prompts, the AGREE parse,
// the verdict) goes through these so the A/B/C scheme is single-sourced.
const peerLetter = (i: number) => String.fromCharCode(65 + i);
const peerTag = (i: number) => `Peer ${peerLetter(i)}`;

function peerBlocks(peers: PeerView[]): string {
	return peers
		.map((p, i) => {
			const tag = peerTag(i);
			const reasoning = p.note ? `\n${tag}'s reasoning last round: ${p.note}` : '';
			return `${tag}'s answer:\n${p.answer}${reasoning}`;
		})
		.join('\n\n');
}

// Each debater sees the question, its own current answer, and its peers' current
// answers and reasoning — then rebuts and revises.
function buildDebaterPrompt(
	query: string,
	ownAnswer: string,
	peers: PeerView[],
	lens?: string
): string {
	const peerTags = peers.map((_, i) => peerTag(i));
	// Ask for a stance toward each peer by name, so the verdict can tell a 2-vs-1
	// split (one holdout) from a three-way one — not just "agree" in the abstract.
	const agreeFormat = peerTags.map((t) => `${t}: <yes or no>`).join(', ');
	const instructions = `Several AI models are debating the best answer to a question. Below is your current answer and your anonymized peers' current answers — and, from the second round on, the reasoning each peer gave for their position. Engage with their reasoning directly: where a peer's argument is stronger, adopt it; where you disagree, say why and hold your ground — do not cave just to agree.

Question:
${query}

Your current answer:
${ownAnswer}

${peerBlocks(peers)}

Reply in EXACTLY this format, each label on its own line, nothing before or after:
CHANGED: <yes or no — did you materially change your answer?>
AGREE: ${agreeFormat} — for each peer, answer "no" if that peer's position still genuinely differs from yours on the core question.
NOTE: <one sentence addressing your peers: what you changed and why, or why you still disagree>
ANSWER:
<your full revised answer>`;
	// The lens shapes only this debater's own disposition, never the peers' — so
	// the A/B anonymity holds.
	return lens ? `${lens}${SECTION_RULE}${instructions}` : instructions;
}

// A one-line gist of an answer for the consensus ledger — first sentence, capped.
function gist(text: string): string {
	const clean = text.replace(/\s+/g, ' ').trim();
	const sentence = clean.match(/^.*?[.!?](?=\s|$)/)?.[0]?.trim();
	const out = sentence && sentence.length >= 20 ? sentence : clean;
	return out.length > 160 ? `${out.slice(0, 157).trimEnd()}…` : out;
}

// The model's own SUMMARY: line, if it followed the Phase-1 instruction. Falls
// back to `gist()` when missing or empty so the ledger always has something —
// older history, a model that ignored the format, or a partial stream all stay
// readable. Scans mid-text (not just final line) with the `m` flag, tolerates
// leading bullet markers (`-`, `*`, `•`, `>`), bold around the label
// (`**SUMMARY:**`, `**SUMMARY**:`, `*SUMMARY*:`), colon or en/em-dash
// separators, and bold around the value (outer `**` stripped). When the model
// emits more than one SUMMARY line (e.g. self-corrects), the LAST one wins.
// Literal angle-bracket placeholders echoed from the prompt template (e.g.
// `<one short sentence stating your position>`) are rejected and fall through
// to gist() so they never reach the ledger.
export function extractInitialSummary(text: string): string {
	const regex =
		/(?:^|\n)[ \t]*[-*•>]?[ \t]*\**[ \t]*SUMMARY[ \t]*\**[ \t]*[:\-–—][ \t]*\**[ \t]*(.+?)[ \t]*$/gim;
	const matches = [...text.matchAll(regex)];
	const last = matches[matches.length - 1];
	let summary = last?.[1]?.trim() ?? '';
	// Strip outer bold markers (`**foo**` or `*foo*`) from the captured value, and
	// any stray trailing `**` left from a `**SUMMARY:**` bold-around-label form.
	const boldStripped = summary.match(/^\*{1,2}(.+?)\*{1,2}$/);
	if (boldStripped) summary = boldStripped[1].trim();
	else summary = summary.replace(/\*{1,2}\s*$/, '').trimEnd();
	// Reject literal angle-bracket placeholders echoed from the prompt.
	if (/^<.+>$/.test(summary)) summary = '';
	if (summary.length > 0) {
		return summary.length > 160 ? `${summary.slice(0, 157).trimEnd()}…` : summary;
	}
	return gist(text);
}

// Strip trailing `SUMMARY: …` lines (with leading bullets / bold) so per-node
// panels show the substantive answer, not the metadata tail that exists for the
// ledger. Some models (notably small ones) emit a one-line answer immediately
// followed by an identical SUMMARY line, which doubles up in the panel — this
// removes the duplicate. Walks backward through any sequence of SUMMARY lines
// interleaved with blanks so a self-correcting model's earlier SUMMARY lines
// don't leak through either. Mid-stream partials — a bare `SUMMARY` with no
// separator yet, or `SUMMARY:` with no value yet — also count, to avoid a
// one-frame flicker while the value's first chars are still in flight.
// Conservative: only strips when there is *other* content above the SUMMARY
// run, so an answer that's only the SUMMARY survives intact.
const SUMMARY_LINE_RE = /^[ \t]*[-*•>]?[ \t]*\**[ \t]*SUMMARY[ \t]*\**[ \t]*[:\-–—][ \t]*.*$/i;
const SUMMARY_PREFIX_RE = /^[ \t]*[-*•>]?[ \t]*\**[ \t]*SUMMARY[ \t]*\**[ \t]*$/i;
const isSummaryLine = (line: string) => SUMMARY_LINE_RE.test(line) || SUMMARY_PREFIX_RE.test(line);
export function stripSummaryTail(text: string): string {
	const lines = text.split('\n');
	let i = lines.length - 1;
	let strippedAny = false;
	// Walk backward through trailing SUMMARY lines interleaved with blanks.
	while (i >= 0) {
		while (i >= 0 && lines[i].trim() === '') i -= 1;
		if (i < 0 || !isSummaryLine(lines[i])) break;
		strippedAny = true;
		i -= 1;
	}
	if (!strippedAny) return text;
	const hasOtherContent = lines.slice(0, i + 1).some((l) => l.trim() !== '');
	if (!hasOtherContent) return text;
	return lines
		.slice(0, i + 1)
		.join('\n')
		.trimEnd();
}

// The trimmed inputs surfaced in the node panel — the substance the node reacted
// to (its prior answer + anonymized peers, with their reasoning), without the
// fixed instruction scaffolding that repeats every round.
function surfacedInputs(ownAnswer: string, peers: PeerView[]): string {
	return `**Your previous answer:**\n${ownAnswer}\n\n${peerBlocks(peers)}`;
}

// Resolve the AGREE line into a positional stance per peer. Prefers explicit
// "Peer A: yes, Peer B: no" breakdowns; falls back to a bare "yes"/"no" applied
// to every peer when the model ignored the per-peer format. Unstated → null.
function parsePeerAgreement(agreeLine: string, peerCount: number): (boolean | null)[] {
	const out: (boolean | null)[] = Array.from({ length: peerCount }, () => null);
	let sawPeer = false;
	for (let i = 0; i < peerCount; i += 1) {
		const letter = peerLetter(i);
		const m = agreeLine.match(new RegExp(`Peer\\s*${letter}\\s*[:-]?\\s*\\*{0,2}(yes|no)`, 'i'));
		if (m) {
			sawPeer = true;
			out[i] = m[1].toLowerCase() === 'yes';
		}
	}
	// No per-peer tokens but a lone yes/no → apply it across the board.
	if (!sawPeer) {
		const bare = agreeLine.match(/\b(yes|no)\b/i);
		if (bare) out.fill(bare[1].toLowerCase() === 'yes');
	}
	return out;
}

// Pull the CHANGED flag, per-peer AGREE stances, and revised ANSWER out of a
// debater's reply. Plain-text parsing (not structured output) so it works on
// every model, including free-tier ones. Tolerant of bold markers and ':'/'-'.
function parseDebaterReply(text: string, fallbackAnswer: string, peerCount: number): DebaterReply {
	const answerMatch = text.match(/ANSWER\s*[:-]?\s*\n?([\s\S]*)$/i);
	const parsed = answerMatch?.[1]?.trim();
	const hasNewAnswer = !!parsed && parsed.length > 0;

	const changedMatch = text.match(/CHANGED\s*[:-]?\s*\*{0,2}(yes|no)/i);
	const agreeLine = text.match(/AGREE\s*[:-]?\s*(.+?)(?:\r?\n|$)/i)?.[1] ?? '';
	const noteMatch = text.match(/NOTE\s*[:-]?\s*\*{0,2}(.+?)(?:\r?\n|$)/i);

	return {
		// No usable revision → the answer didn't change. Otherwise trust the flag,
		// defaulting to "changed" when it's missing (conservative: keep debating).
		changed: hasNewAnswer ? (changedMatch ? changedMatch[1].toLowerCase() === 'yes' : true) : false,
		agree: parsePeerAgreement(agreeLine, peerCount),
		note: noteMatch?.[1]?.trim() ?? '',
		answer: hasNewAnswer ? parsed : fallbackAnswer
	};
}

// Combine two debaters' self-reported stances on a pair into one status.
// Disagreement dominates: a single explicit "no" (in either direction) means the
// pair is not aligned, even if the other side called it agreement.
type PairStatus = 'agree' | 'disagree' | 'unknown';
function pairStatus(directed: Map<string, boolean>, a: MagiNodeName, b: MagiNodeName): PairStatus {
	const ab = directed.get(`${a}->${b}`);
	const ba = directed.get(`${b}->${a}`);
	if (ab === false || ba === false) return 'disagree';
	if (ab === true || ba === true) return 'agree';
	return 'unknown';
}

// Identify the lone dissenter in a 2-vs-1 split — the node whose answer disagrees
// with both of the other two (who agree with each other). Returns null for
// three-way splits, < 3 debaters, or when the agreement graph is too sparse to
// pick a clean dissenter. Drives both the user-facing coalition phrase and the
// dissenter-by-node metric in [[debate-stats]].
function findDissenter(
	nodes: MagiNodeName[],
	status: (a: MagiNodeName, b: MagiNodeName) => PairStatus
): MagiNodeName | null {
	if (nodes.length !== 3) return null;
	for (const odd of nodes) {
		const [x, y] = nodes.filter((n) => n !== odd);
		const dissents = status(odd, x) === 'disagree' || status(odd, y) === 'disagree';
		if (status(x, y) === 'agree' && dissents) return odd;
	}
	return null;
}

// Describe the coalition shape of a split for the banner/ledger. Names the common
// 2-vs-1 case (an aligned pair plus a dissenter); anything messier reads as a
// plain three-way divide.
function coalitionPhrase(
	nodes: MagiNodeName[],
	status: (a: MagiNodeName, b: MagiNodeName) => PairStatus,
	labels: Record<MagiNodeName, string>
): string {
	if (nodes.length < 3) return 'the MAGI hold differing positions';
	const odd = findDissenter(nodes, status);
	if (odd) {
		const [x, y] = nodes.filter((n) => n !== odd);
		return `${labels[x]} & ${labels[y]} aligned; ${labels[odd]} dissents`;
	}
	return 'the three MAGI each hold a different position';
}

export const debateStrategy: ConsensusStrategy = {
	name: 'debate',
	description:
		'Models critique and revise across multiple rounds until they converge, then one synthesizes the final answer',

	async *execute(ctx: ConsensusContext): AsyncIterable<ConsensusEvent> {
		const {
			responses,
			query,
			history = [],
			getModel,
			nodeAssignments,
			consensusNodeIndex,
			consensusTemperament,
			synthesizerAwareness,
			nodeTemperaments,
			genericLabels,
			signal,
			tier,
			peerOrderSeed
		} = ctx;

		const labels = genericLabels ? NODE_LABELS_GENERIC : NODE_LABELS;
		// This turn's seat order for the anonymized Peer A/B presentation. Built once
		// so every round assigns the same letter to the same peer (a stable mapping
		// matters across rounds); identity (node order) when no seed is supplied.
		const orderPeers = makePeerOrderer(responses, peerOrderSeed);
		const usage: UsageTotals = { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 };
		const addUsage = (u?: {
			inputTokens?: number;
			outputTokens?: number;
			cachedInputTokens?: number;
		}) => {
			usage.inputTokens += u?.inputTokens ?? 0;
			usage.outputTokens += u?.outputTokens ?? 0;
			usage.cachedInputTokens += u?.cachedInputTokens ?? 0;
		};

		// Accumulate the full markdown as we stream it, so the `complete` event
		// carries the transcript + divider + final answer verbatim.
		let fullText = '';
		const emit = (text: string): ConsensusEvent => {
			fullText += text;
			return { type: 'text-delta', text };
		};

		// Stats state for [[debate-stats]] — populated as the debate progresses;
		// `runStats()` reads it at the end. Kept at this scope so both the early
		// walkover branch and the main loop write to the same fields.
		let verdictForStats: DebateVerdict | undefined;
		let roundsRun = 0;
		let hitLimitForStats = false;
		let dissenterForStats: MagiNodeName | null = null;
		const revisionCounts: Partial<Record<MagiNodeName, number>> = {};

		const buildDebateStats = (): DebateStats | undefined => {
			if (responses.length === 0 || !verdictForStats) return undefined;
			const models: Partial<Record<MagiNodeName, string>> = {};
			for (const r of responses) {
				const a = nodeAssignments.find((a) => a.node === r.node);
				if (a) models[r.node] = a.modelId;
			}
			return {
				verdict: verdictForStats,
				hitLimit: hitLimitForStats,
				rounds: roundsRun,
				revisions: revisionCounts,
				models,
				dissenter: dissenterForStats
			};
		};

		const runStats = (): ConsensusEvent => ({
			type: 'run-stats',
			stats: {
				strategy: 'debate',
				tier: tier ?? 'unknown',
				synthesizerAwareness: synthesizerAwareness ?? false,
				consensusTemperament: consensusTemperament ?? false,
				nodes: nodeIdentities(responses, nodeAssignments),
				debate: buildDebateStats()
			}
		});

		// Nothing to debate or synthesize.
		if (responses.length === 0) {
			yield emit('No responses were available to debate.');
			yield { type: 'complete', fullText };
			yield { type: 'usage', ...usage };
			yield runStats();
			return;
		}

		// Each node's current answer — round 0 is the Phase-1 responses.
		const current = new Map<MagiNodeName, string>();
		for (const r of responses) current.set(r.node, r.text);
		// Each node's rationale from the previous round, fed to its peers next round.
		const notes = new Map<MagiNodeName, string>();

		yield emit('### 🗣️ Multi-Round Debate\n');

		// How the debate ended — drives the consensus/split headline banner and the
		// final synthesizer's brief. Set per branch below. `debateSummary` carries the
		// coalition shape for a split (e.g. "X & Y aligned; Z dissents").
		let verdict: DebateVerdict;
		let debateSummary: string | undefined;

		if (responses.length === 1) {
			// One voice — nothing was debated; the synthesizer just relays it.
			verdict = 'walkover';
			verdictForStats = 'walkover';
			yield emit(`\nOnly ${labels[responses[0].node]} responded — no debate was held.\n`);
		} else {
			// Initial positions — each node's opening stance, before any rebuttal.
			// Prefers the model's own SUMMARY: line (asked for in Phase 1 when the
			// strategy is debate); falls back to a first-sentence gist when the line
			// is absent so older history and stragglers still read sensibly.
			let intro = `\n**Initial positions**\n`;
			for (const r of responses) intro += `- ${labels[r.node]}: ${extractInitialSummary(r.text)}\n`;
			yield emit(intro);

			// Directed agreement edges keyed `from->to`: does `from` say its answer
			// agrees with `to`? Latest round wins. Only parseable yes/no lands here, so
			// a missing stance never reads as agreement.
			const directed = new Map<string, boolean>();

			// Seed revision counts at 0 for every responding node so the stats panel
			// can divide by `rounds` even when a node never revised.
			for (const r of responses) revisionCounts[r.node] = 0;

			// Debate rounds. All debaters run in parallel; because every prompt is
			// built from `current` before any await resolves, the revisions are
			// effectively simultaneous (peers see the prior round's answers).
			let round = 1;
			for (; round <= MAX_ROUNDS; round += 1) {
				const runs = await Promise.allSettled(
					responses.map(async (r) => {
						const assignment = nodeAssignments.find((a) => a.node === r.node);
						if (!assignment) throw new Error(`No assignment for debater ${r.node}`);
						const ownAnswer = current.get(r.node) ?? r.text;
						// Peers carry last round's rationale (empty in round 1). `peerNodes`
						// records which actual node each anonymized Peer A/B is, so the
						// per-peer AGREE stances can be mapped back into the agreement graph.
						const peerResponses = orderPeers(responses.filter((p) => p.node !== r.node));
						const peerNodes = peerResponses.map((p) => p.node);
						const peers: PeerView[] = peerResponses.map((p) => ({
							answer: current.get(p.node) ?? p.text,
							note: notes.get(p.node)
						}));
						// Debaters argue in-character whenever the MAGI are in-character —
						// they ARE the nodes continuing to think. (The synthesizer, by
						// contrast, stays a neutral scribe.)
						const lens = nodeTemperaments
							? TEMPERAMENT_SYSTEM_PROMPTS[NODE_TEMPERAMENTS[r.node]]
							: undefined;
						const { text, usage: u } = await generateText({
							model: getModel(assignment.gateway, assignment.modelId),
							prompt: buildDebaterPrompt(query, ownAnswer, peers, lens),
							abortSignal: signal
						});
						return {
							reply: parseDebaterReply(text, ownAnswer, peerNodes.length),
							usage: u,
							surfaced: surfacedInputs(ownAnswer, peers),
							peerNodes
						};
					})
				);

				// Per-node ledger line: the reliable revised/held status plus the
				// debater's own one-line NOTE for a quick overview of the round.
				let block = `\n**Round ${round}**\n`;
				let anyChanged = false;
				for (let i = 0; i < runs.length; i += 1) {
					const node = responses[i].node;
					const run = runs[i];
					if (run.status !== 'fulfilled') {
						// A failed debater keeps its prior answer and isn't counted as
						// movement, so a persistent failure can't block convergence.
						block += `- ${labels[node]}: no response\n`;
						continue;
					}
					addUsage(run.value.usage);
					const { reply, peerNodes } = run.value;
					current.set(node, reply.answer);
					notes.set(node, reply.note);
					// Record this debater's stance toward each peer it named.
					peerNodes.forEach((peer, pi) => {
						const stance = reply.agree[pi];
						if (stance !== null) directed.set(`${node}->${peer}`, stance);
					});
					if (reply.changed) {
						anyChanged = true;
						revisionCounts[node] = (revisionCounts[node] ?? 0) + 1;
					}
					const status = reply.changed ? 'revised' : 'held';
					block += `- ${labels[node]}: ${status}${reply.note ? ` — ${reply.note}` : ''}\n`;
					// Surface this node's round detail to its panel (not the consensus stream).
					yield {
						type: 'node-round',
						node,
						entry: { round, prompt: run.value.surfaced, response: reply.answer }
					};
				}
				yield emit(block);

				// Converged — no debater moved this round.
				if (!anyChanged) break;
			}

			// Decide the verdict from the pairwise agreement graph, falling back to the
			// convergence signal when the debaters left it unstated. Stability alone is
			// NOT agreement — debaters can stop moving while still holding rival
			// positions (a stalemate), so we never call that "consensus" without a
			// positive signal.
			//   • any pair explicitly disagrees        → split (they still diverge)
			//   • every pair explicitly agrees         → consensus
			//   • no explicit signal → infer: stabilized early = consensus,
			//     hit the round limit still changing = split.
			const hitLimit = round > MAX_ROUNDS;
			const respNodes = responses.map((r) => r.node);
			const status = (a: MagiNodeName, b: MagiNodeName) => pairStatus(directed, a, b);
			const pairs: PairStatus[] = [];
			for (let i = 0; i < respNodes.length; i += 1)
				for (let j = i + 1; j < respNodes.length; j += 1)
					pairs.push(status(respNodes[i], respNodes[j]));
			const anyDisagree = pairs.some((p) => p === 'disagree');
			const allAgree = pairs.length > 0 && pairs.every((p) => p === 'agree');
			verdict = anyDisagree ? 'split' : allAgree ? 'consensus' : hitLimit ? 'split' : 'consensus';

			// Capture for [[debate-stats]] — the inner-block locals don't escape.
			verdictForStats = verdict;
			hitLimitForStats = hitLimit;
			roundsRun = hitLimit ? MAX_ROUNDS : round;
			if (verdict === 'split') dissenterForStats = findDissenter(respNodes, status);

			const roundWord = round === 1 ? 'round' : 'rounds';
			// A blockquote callout — a clearly set-apart status line between the round
			// ledger and the synthesized answer (which follows after the divider). The
			// glanceable verdict also rides in the consensus panel header.
			if (verdict === 'consensus') {
				yield emit(
					hitLimit
						? `\n> 🔺🔻🔺 **Reached the ${MAX_ROUNDS}-round limit** — the MAGI are in agreement.\n`
						: `\n> 🔺🔻🔺 **Converged after ${round} ${roundWord}** — the MAGI are in agreement.\n`
				);
			} else {
				debateSummary = coalitionPhrase(respNodes, status, labels);
				yield emit(
					hitLimit
						? `\n> ⚖️ **Reached the ${MAX_ROUNDS}-round limit without full agreement** — ${debateSummary}.\n`
						: `\n> ⚖️ **Stalemate after ${round} ${roundWord}** — ${debateSummary}.\n`
				);
			}
		}

		// Final synthesis: a NEUTRAL scribe. All the perspective and reasoning lives
		// in the debaters (lensed by consensusTemperament); the synthesizer just
		// consolidates the converged answers faithfully — no temperament lens, no
		// dispositional editorializing — so the consensus isn't tilted by a fourth
		// voice at the final step.
		const assignment = nodeAssignments[consensusNodeIndex];

		const n = responses.length;
		const formatted = responses
			.map((r) => `=== ${labels[r.node]} (${r.provider}) ===\n${current.get(r.node) ?? r.text}`)
			.join('\n\n');

		// Name the absentees so the synthesizer can acknowledge them in the
		// reply — readers expect three perspectives, and a silent two-of-three
		// consensus reads as if nothing went wrong.
		const missingLabels = nodeAssignments
			.filter((a) => !responses.some((r) => r.node === a.node))
			.map((a) => labels[a.node]);
		const missingClause =
			missingLabels.length > 0
				? `\n\nUnavailable for this debate: ${missingLabels.join(', ')}. Acknowledge ${
						missingLabels.length === 1 ? 'this absence' : 'these absences'
					} briefly so the reader knows the consensus is missing ${
						missingLabels.length === 1 ? 'a perspective' : 'perspectives'
					} — do not let absent MAGI vanish silently.`
				: '';

		const synthesisPrompt = `Original query: ${query}

After a multi-round debate, the ${n === 3 ? 'three' : n} MAGI hold these ${n === 1 ? 'answer' : 'answers'}:

${formatted}${missingClause}

${
	verdict === 'split'
		? `The debaters did NOT reach full agreement — they hold genuinely differing positions. Coalition: ${debateSummary ?? 'positions differ'}.

You are writing as ${labels[assignment.node]}. Your own answer above carries NO extra weight just because it's yours — present every position at full strength, including the one(s) you disagree with. If your seat is in the minority coalition, your view does not get to crowd out the majority.

Do not paper over the disagreement: state what they agree on, then lay out each distinct position and the strongest case for it, and be explicit that the MAGI are divided.`
		: 'Provide the synthesized consensus response.'
}`;

		const messages: ModelMessage[] = [];
		for (const turn of history) {
			// A failed or aborted turn commits with an empty consensus — skip the
			// pair rather than replay an empty assistant message, which some
			// providers reject outright.
			if (!turn.consensus) continue;
			messages.push({ role: 'user', content: turn.query });
			messages.push({ role: 'assistant', content: turn.consensus });
		}
		messages.push({ role: 'user', content: synthesisPrompt });
		markCacheBreakpoint(messages);

		yield emit(SECTION_RULE);

		const result = streamText({
			model: getModel(assignment.gateway, assignment.modelId),
			system: `You are the MAGI consensus system. ${
				n === 3
					? 'Three independent AI models have each debated and revised'
					: `${n} of three independent AI models debated and revised`
			} their answers to the same query. The debate is done — your job is to consolidate, not to add a new perspective.${
				verdict === 'split'
					? ` The debaters remained divided, so do not manufacture a false consensus. You are one of the debaters; the position you produced has NO privileged status — treat each side equitably regardless of which one is yours. Report the outcome honestly:

1. State the points where the ${n === 3 ? 'three' : 'available'} answers do agree.
2. Lay out each remaining position distinctly, with the strongest case for each — give the majority coalition and any dissenter equal airtime.
3. Make the disagreement explicit — name that the MAGI are split rather than picking a winner by fiat.

Be clear and faithful to the divide; do NOT smooth it over into one verdict, and do NOT collapse it into your own view.`
					: ` Synthesize the best possible answer by:

1. Identifying where the ${n === 3 ? 'three' : 'available'} answers now agree — these points are likely reliable.
2. Noting where they still disagree and evaluating which position is strongest.
3. Combining the best elements into a single, clear, definitive response.
4. Flagging any remaining uncertainty honestly.

Do NOT simply concatenate or summarize. Produce a unified answer that is better than any individual response.`
			}`,
			messages,
			abortSignal: signal
		});

		for await (const chunk of result.textStream) {
			yield emit(chunk);
		}
		addUsage(await result.usage);

		yield { type: 'complete', fullText, debateVerdict: verdict, debateSummary };
		yield { type: 'usage', ...usage };
		yield runStats();
	}
};
