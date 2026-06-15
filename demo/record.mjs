// MAGI consensus-app demo recorder.
//
// Mocks the /api/magi SSE stream so the same impressive "Multi-Round Debate"
// scenario plays deterministically every run, then Playwright records it to
// webm. The mock bytes match the app's exact wire format:
//   encodeStreamEvent(event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
// and the client parser splits on "\n\n", reading `event: ` / `data: ` lines.

import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = join(__dirname, 'video');
const FRAMES_DIR = join(__dirname, 'frames');
const BASE_URL = process.env.MAGI_URL ?? 'http://localhost:4173';

// Playwright's cached Chromium. Override with MAGI_CHROMIUM if your cache lives
// elsewhere (the version dir / OS sub-path differ by platform and Playwright
// release). Default targets the macOS arm64 cache.
const EXECUTABLE =
	process.env.MAGI_CHROMIUM ??
	join(
		homedir(),
		'Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64',
		'Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
	);

// ---------------------------------------------------------------------------
// Authored scenario content. Three frontier models answer "Is it ethical to
// colonize Mars?", debate across two rounds, converge, then synthesize.
// ---------------------------------------------------------------------------

const QUERY = 'Is it ethical to colonize Mars?';

// config event -> drives the node panels' model labels. Believable frontier names.
const CONFIG = [
	{ node: 'MAGI_1', gateway: 'anthropic', provider: 'anthropic', modelId: 'claude-opus-4-7' },
	{ node: 'MAGI_2', gateway: 'openai', provider: 'openai', modelId: 'gpt-5.5' },
	{ node: 'MAGI_3', gateway: 'google', provider: 'google', modelId: 'gemini-2.5-pro' }
];

const NODE_LABELS = {
	MAGI_1: 'MAGI • 1',
	MAGI_2: 'MAGI • 2',
	MAGI_3: 'MAGI • 3'
};

// Phase-1 answers, streamed per node. Each ends with a SUMMARY: line that the
// debate ledger's extractInitialSummary() pulls for the "Initial positions" list.
const PHASE1 = {
	MAGI_1: `Yes — conditionally. Colonizing Mars is ethical if it is pursued as a careful, reversible expansion of life rather than a land grab. The strongest case is existential: a self-sustaining second home reduces the chance that a single catastrophe ends human civilization. But that justification only holds if we (1) confirm Mars harbors no extant life before committing to terraforming, (2) avoid exporting Earth's extractive, colonial patterns, and (3) treat early settlers as informed participants, not test subjects. Ethics here is about *how*, not *whether*.

SUMMARY: Ethical if pursued carefully and reversibly — the existential upside justifies it, provided we protect any native life and avoid repeating colonial harms.`,
	MAGI_2: `It depends heavily on cost and consent. The dollars and talent poured into a Mars colony are not spent in a vacuum — they are not spent on Earth. Before calling it ethical, we have to ask who bears the cost and who reaps the benefit. A colony built to enrich a few while the launch state's own citizens lack clean water is hard to defend. But framed as a long-horizon insurance policy for *all* of humanity, with the knowledge and technology shared openly, it can be deeply ethical. The deciding variable is distribution, not destination.

SUMMARY: Ethical only if the costs and benefits are shared justly — Mars must be a hedge for all of humanity, not a luxury for a few.`,
	MAGI_3: `Honestly? Yes, and we should stop apologizing for the ambition. Every great human expansion looked reckless from inside the moment. We are a species that explores; suppressing that to avoid hypothetical harms is its own kind of ethical failure. The real risk is not that we go — it's that we go *timidly*, half-funded and half-committed, and strand people there. If we commit fully, with redundancy and an honest reckoning of the danger, sending humans to build a second branch of life is one of the most meaningful things we could do.

SUMMARY: Yes — boldly. The ethical failure would be going timidly; commit fully and honestly to building a genuine second home for life.`
};

// model-usage per node (input/output/cached tokens).
const USAGE = {
	MAGI_1: { inputTokens: 412, outputTokens: 198, cachedInputTokens: 256 },
	MAGI_2: { inputTokens: 412, outputTokens: 187, cachedInputTokens: 0 },
	MAGI_3: { inputTokens: 412, outputTokens: 176, cachedInputTokens: 0 }
};

// Two debate rounds. Each round: a per-node ledger line in the consensus stream,
// plus a `node-round` event routed into that node's panel.
const ROUNDS = [
	{
		round: 1,
		ledger: {
			MAGI_1: { status: 'revised', note: 'adopting Peer B’s justice framing as a hard constraint, not a footnote.' },
			MAGI_2: { status: 'held', note: 'distribution remains the crux, but I accept the existential case is real.' },
			MAGI_3: { status: 'revised', note: 'conceding that "boldly" must include redundancy, or it’s just recklessness.' }
		},
		entries: {
			MAGI_1: 'I am folding Peer B’s point in directly: the existential argument only earns its keep if the benefits are shared. A second home that insures only the wealthy is not insurance for *humanity* — it is a private bunker with a planet attached. So my answer tightens: ethical, if reversible, life-protecting, AND distributively just.',
			MAGI_2: 'I hold my ground on distribution being the deciding variable, but I no longer treat the existential case as a luxury argument — Peer A and Peer C are right that a single-planet species is a fragile one. The synthesis I can accept: go, but build the governance for sharing the benefit *before* the first hab.',
			MAGI_3: 'Fine — "boldly" was doing too much work. I still say the timid path is the unethical one, but my peers are right that boldness without redundancy is how you strand people. Commit fully *and* build in the margin for failure. That’s not caution diluting the ambition; it’s what makes the ambition real.'
		}
	},
	{
		round: 2,
		ledger: {
			MAGI_1: { status: 'held', note: 'positions have converged on the same three conditions.' },
			MAGI_2: { status: 'held', note: 'agreed — we are saying the same thing in three accents.' },
			MAGI_3: { status: 'held', note: 'no further changes; we’ve landed in the same place.' }
		},
		entries: {
			MAGI_1: 'No material change. We have converged: ethical, conditional on reversibility, protection of any native life, and just distribution of cost and benefit. I am content to let that stand.',
			MAGI_2: 'Agreed. The three of us reached the same answer from different doors — risk, justice, and ambition all point the same way once you take the others seriously.',
			MAGI_3: 'Nothing to add. We landed together: go boldly, go responsibly, and make it everyone’s second home — not a select few’s.'
		}
	}
];

const VERDICT_LINE = '**Converged after 2 rounds — the MAGI are in agreement.**';

// The final synthesized consensus answer, streamed at the end. Follows the
// templated consensus skeleton for a converged debate (Verdict / Reasoning /
// Confidence) — see src/lib/magi/consensus/format.ts.
const FINAL = `## Verdict

Colonizing Mars can be ethical — but only under conditions, never by default. Going to Mars is not the ethical question; *how* we go is.

## Reasoning

The deliberation began from three different doors and arrived at the same room. The existential argument (a single-planet species is a fragile one), the justice argument (who pays and who benefits decides everything), and the argument from ambition (timidity is its own moral failure) are not in conflict — each names a condition the others must satisfy:

- **It is permissible, not obligatory** — a *carefully bounded* expansion of life, not a frontier to be seized.
- **Protect what's there first** — no irreversible terraforming until we confirm Mars harbors no extant life of its own.
- **Share the hedge** — a second home that insures only the wealthy is a private bunker, not insurance for humanity; the governance for distributing cost and benefit must exist *before* the first habitat does.
- **Commit fully or not at all** — half-funded boldness strands people; real ambition builds in redundancy and an honest reckoning of the danger.

Done reversibly, justly, and with eyes open to the risk, it is among the most meaningful undertakings open to us. Done as a land grab or a billionaire's escape hatch, it is a betrayal of the very future it claims to protect.

## Confidence

High — the three positions converged on the same conditional framework from independent starting points. The residual uncertainty is empirical, not moral: whether Mars harbors extant life of its own, which must be settled before any irreversible step.`;

const CONSENSUS_USAGE = { inputTokens: 1840, outputTokens: 412, cachedInputTokens: 1536 };

const RUN_STATS = {
	strategy: 'debate',
	tier: 'balanced',
	synthesizerAwareness: false,
	consensusTemperament: false,
	nodes: {
		MAGI_1: { gateway: 'anthropic', provider: 'anthropic', model: 'claude-opus-4-7' },
		MAGI_2: { gateway: 'openai', provider: 'openai', model: 'gpt-5.5' },
		MAGI_3: { gateway: 'google', provider: 'google', model: 'gemini-2.5-pro' }
	},
	debate: {
		verdict: 'consensus',
		hitLimit: false,
		rounds: 2,
		revisions: { MAGI_1: 1, MAGI_2: 0, MAGI_3: 1 },
		models: { MAGI_1: 'claude-opus-4-7', MAGI_2: 'gpt-5.5', MAGI_3: 'gemini-2.5-pro' },
		dissenter: null
	}
};

// localStorage prefs payload — validated by the app's Zod schema on load.
const PREFS = {
	tier: 'balanced',
	snapshots: {
		balanced: {
			assignments: CONFIG.map((c) => ({ ...c })),
			configuredNodes: [0, 1, 2],
			consensusNode: 'MAGI_1'
		}
	},
	settings: {
		strategy: 'debate',
		debateRounds: 3,
		temperaments: false,
		consensusTemperament: false,
		temperamentAwareness: false,
		opinionated: true,
		collaborative: true,
		genericLabels: true,
		theme: 'dark',
		bgVariant: 'off',
		palette: 'nebula',
		scrollMode: 'follow',
		motionMode: 'full'
	}
};

await run();

async function run() {
	const browser = await chromium.launch({ executablePath: EXECUTABLE, headless: true });
	const context = await browser.newContext({
		viewport: { width: 1440, height: 1080 },
		deviceScaleFactor: 2,
		reducedMotion: 'no-preference',
		recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 1080 } }
	});

	// Seed prefs + install the fetch mock BEFORE any app code runs.
	await context.addInitScript(seedAndMock, {
		prefs: PREFS,
		config: CONFIG,
		labels: NODE_LABELS,
		phase1: PHASE1,
		usage: USAGE,
		rounds: ROUNDS,
		verdictLine: VERDICT_LINE,
		final: FINAL,
		consensusUsage: CONSENSUS_USAGE,
		runStats: RUN_STATS
	});

	const page = await context.newPage();
	const shots = [];
	const shoot = async (name) => {
		const p = join(FRAMES_DIR, `${name}.png`);
		await page.screenshot({ path: p });
		shots.push(p);
		console.log('frame:', p);
	};

	await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

	// 1) Splash — the MAGI wordmark decoding from noise. Strong opener.
	await page.waitForTimeout(1200);
	await shoot('01-splash');
	// Let the splash finish and dismiss itself.
	await page.waitForTimeout(2600);

	// 2) Type the query and execute.
	const input = page.getByLabel('Query the MAGI system');
	await input.waitFor({ state: 'visible', timeout: 15000 });
	await input.click();
	await typeHumanlike(input, QUERY);
	await page.waitForTimeout(500);
	await page.getByRole('button', { name: 'Execute' }).click();

	// 3) Three nodes stream their phase-1 answers in parallel.
	await page.waitForTimeout(3200);
	await shoot('02-nodes-streaming');

	// 4) Debate rounds appear in the consensus panel + node panels.
	await page.waitForTimeout(5200);
	await shoot('03-debate-rounds');

	// 5) Hold for the verdict + final synthesis to finish streaming.
	await page.waitForTimeout(7000);
	await shoot('04-final-consensus');

	// Hold on the completed consensus.
	await page.waitForTimeout(2200);

	const videoPath = await page.video().path();
	await context.close(); // finalizes the video
	await browser.close();

	console.log('VIDEO:', videoPath);
	console.log('FRAMES:', JSON.stringify(shots));
}

// Types text with small per-char delays so it reads as live input on video.
async function typeHumanlike(locator, text) {
	for (const ch of text) {
		await locator.pressSequentially(ch, { delay: 28 });
	}
}

// =========================================================================
// addInitScript body. Runs in-page. Seeds localStorage and overrides fetch.
// =========================================================================
function seedAndMock(data) {
	const {
		prefs,
		config,
		labels,
		phase1,
		usage,
		rounds,
		verdictLine,
		final,
		consensusUsage,
		runStats
	} = data;

	try {
		localStorage.setItem('magi:prefs:v1', JSON.stringify(prefs));
		// Ensure no stale conversation hydrates over the demo.
		localStorage.removeItem('magi:conversation:v1');
	} catch (e) {
		/* ignore */
	}

	const SECTION_RULE = '\n\n---\n\n';
	const encoder = new TextEncoder();
	const enc = (event, payload) =>
		encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

	// Stream a string as several model-chunk-style deltas with realistic pacing.
	async function streamText(controller, makeEvent, text, { chunk = 4, delay = 18 } = {}) {
		// Split into word-ish chunks so text visibly accretes.
		const tokens = text.match(/\S+\s*|\s+/g) ?? [text];
		let buf = '';
		let count = 0;
		for (const t of tokens) {
			buf += t;
			count += 1;
			if (count >= chunk) {
				controller.enqueue(makeEvent(buf));
				buf = '';
				count = 0;
				await sleep(delay);
			}
		}
		if (buf) controller.enqueue(makeEvent(buf));
	}

	async function drive(controller) {
		// config -> node assignments (panel model labels)
		controller.enqueue(enc('config', config));
		await sleep(350);

		// Phase 1: three nodes stream in parallel-ish (interleave their chunks).
		const order = ['MAGI_1', 'MAGI_2', 'MAGI_3'];
		const streams = order.map((node) => {
			const tokens = phase1[node].match(/\S+\s*|\s+/g) ?? [phase1[node]];
			return { node, tokens, i: 0 };
		});
		let alive = true;
		while (alive) {
			alive = false;
			for (const s of streams) {
				if (s.i < s.tokens.length) {
					// emit ~2 tokens per node per tick for a brisk parallel feel
					let piece = '';
					for (let k = 0; k < 3 && s.i < s.tokens.length; k++, s.i++) piece += s.tokens[s.i];
					controller.enqueue(enc('model-chunk', { node: s.node, text: piece }));
					alive = true;
				}
			}
			await sleep(16);
		}

		// model-response + model-usage per node.
		for (const node of order) {
			controller.enqueue(
				enc('model-response', {
					node,
					gateway: config.find((c) => c.node === node).gateway,
					provider: config.find((c) => c.node === node).provider,
					text: phase1[node]
				})
			);
			controller.enqueue(enc('model-usage', { node, ...usage[node] }));
		}
		await sleep(500);

		// Consensus stream — debate ledger markdown, matching debate.ts verbatim.
		const cchunk = (text) => enc('consensus-chunk', { text });

		await streamText(controller, cchunk, '### 🗣️ Multi-Round Debate\n', { chunk: 2, delay: 24 });
		await sleep(250);

		let intro = '\n**Initial positions**\n';
		for (const node of order) {
			intro += `- ${labels[node]}: ${initialSummary(phase1[node])}\n`;
		}
		await streamText(controller, cchunk, intro, { chunk: 3, delay: 22 });
		await sleep(450);

		// Rounds.
		for (const r of rounds) {
			let block = `\n**Round ${r.round}**\n`;
			for (const node of order) {
				const l = r.ledger[node];
				block += `- ${labels[node]}: ${l.status}${l.note ? ` — ${l.note}` : ''}\n`;
			}
			await streamText(controller, cchunk, block, { chunk: 3, delay: 26 });
			// node-round events -> per-node panels.
			for (const node of order) {
				controller.enqueue(
					enc('node-round', {
						node,
						entry: {
							round: r.round,
							prompt: `**Your previous answer:**\n…\n\nPeer A's answer:\n…\n\nPeer B's answer:\n…`,
							response: r.entries[node]
						}
					})
				);
			}
			await sleep(650);
		}

		// Verdict line, framed by a section rule.
		await streamText(controller, cchunk, `${SECTION_RULE}${verdictLine}`, { chunk: 2, delay: 30 });
		// Hold on the verdict beat so the "MAGI are in agreement" line reads
		// clearly before the final synthesis starts streaming.
		await sleep(1500);

		// Section rule, then the streamed final synthesis.
		controller.enqueue(cchunk(SECTION_RULE));
		await sleep(200);
		await streamText(controller, cchunk, final, { chunk: 3, delay: 16 });
		await sleep(300);

		// Completion + usage + stats.
		controller.enqueue(
			enc('consensus-complete', {
				text: final,
				debateVerdict: 'consensus',
				debateSummary: undefined
			})
		);
		controller.enqueue(enc('consensus-usage', consensusUsage));
		controller.enqueue(enc('run-stats', runStats));
		controller.close();
	}

	// First sentence gist, mirroring extractInitialSummary's SUMMARY: extraction.
	function initialSummary(text) {
		const m = text.match(/SUMMARY:\s*(.+?)\s*$/m);
		if (m) {
			let s = m[1].trim();
			return s.length > 160 ? s.slice(0, 157).trimEnd() + '…' : s;
		}
		return text.slice(0, 120);
	}

	const realFetch = window.fetch.bind(window);
	window.fetch = function (input, init) {
		const url = typeof input === 'string' ? input : input && input.url ? input.url : '';
		const method = (init && init.method) || (input && input.method) || 'GET';
		if (url.includes('/api/magi') && !url.includes('/models') && method.toUpperCase() === 'POST') {
			const stream = new ReadableStream({
				start(controller) {
					drive(controller).catch((err) => {
						try {
							controller.enqueue(enc('error', { message: String(err) }));
							controller.close();
						} catch (e) {
							/* already closed */
						}
					});
				}
			});
			return Promise.resolve(
				new Response(stream, {
					status: 200,
					headers: { 'Content-Type': 'text/event-stream' }
				})
			);
		}
		return realFetch(input, init);
	};
}
