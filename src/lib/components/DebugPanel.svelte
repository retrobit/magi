<script module lang="ts">
	import { MAGI_NODE_NAMES, type MagiNodeName } from '$lib/magi/types';

	/** How full to drive a model's context window: untouched, into the amber
	 *  warning band (≥75%), or into the red critical band (≥90%). */
	export type ContextLevel = 'off' | 'warn' | 'critical';

	/** A declarative description of which error / context-limit UI states the
	 *  dev debug panel is currently injecting. Applied imperatively by the page. */
	export interface DebugScenario {
		nodeError: Record<MagiNodeName, boolean>;
		/** Force a node into the in-flight ("pending") state — the pulsating glow
		 *  + the sweeping loading verb — without making a real request. */
		nodeLoading: Record<MagiNodeName, boolean>;
		nodeContext: Record<MagiNodeName, ContextLevel>;
		consensusContext: ContextLevel;
		/** Force the consensus loader (the strategy-flavoured sweeping verb) on. */
		consensusLoading: boolean;
		globalError: boolean;
		partialConsensus: boolean;
	}

	export function freshDebugScenario(): DebugScenario {
		return {
			nodeError: { MAGI_1: false, MAGI_2: false, MAGI_3: false },
			nodeLoading: { MAGI_1: false, MAGI_2: false, MAGI_3: false },
			nodeContext: { MAGI_1: 'off', MAGI_2: 'off', MAGI_3: 'off' },
			consensusContext: 'off',
			consensusLoading: false,
			globalError: false,
			partialConsensus: false
		};
	}

	/** True when the scenario injects anything — drives whether the page shows
	 *  a synthetic turn or falls back to its normal idle state. */
	export function isDebugScenarioActive(s: DebugScenario): boolean {
		return (
			MAGI_NODE_NAMES.some(
				(n) => s.nodeError[n] || s.nodeLoading[n] || s.nodeContext[n] !== 'off'
			) ||
			s.consensusContext !== 'off' ||
			s.consensusLoading ||
			s.globalError ||
			s.partialConsensus
		);
	}
</script>

<script lang="ts">
	import type { NodeAssignment } from '$lib/magi/config';
	import { NODE_HEX_COLORS, NODE_LABELS, NODE_LABELS_GENERIC } from '$lib/magi/types';
	import { Bug, X, CircleHelp } from 'lucide-svelte';

	interface Props {
		scenario: DebugScenario;
		assignments: NodeAssignment[];
		genericLabels?: boolean;
		disabled?: boolean;
		onchange: (scenario: DebugScenario) => void;
		onclose: () => void;
		/** Open the dev states catalog (enumerates every status/result/progress indicator). */
		onopencatalog: () => void;
	}

	let {
		scenario,
		assignments,
		genericLabels = false,
		disabled = false,
		onchange,
		onclose,
		onopencatalog
	}: Props = $props();

	const nodeLabels = $derived(genericLabels ? NODE_LABELS_GENERIC : NODE_LABELS);
	const CONTEXT_LEVELS: ContextLevel[] = ['off', 'warn', 'critical'];
	const CONTEXT_LABELS: Record<ContextLevel, string> = {
		off: 'Context OK',
		warn: 'Context 80%',
		critical: 'Context 95%'
	};

	function setNodeError(node: MagiNodeName, value: boolean) {
		// Error and Loading are mutually exclusive — flipping Error on clears Loading.
		onchange({
			...scenario,
			nodeError: { ...scenario.nodeError, [node]: value },
			nodeLoading: { ...scenario.nodeLoading, [node]: value ? false : scenario.nodeLoading[node] }
		});
	}

	function setNodeLoading(node: MagiNodeName, value: boolean) {
		onchange({
			...scenario,
			nodeLoading: { ...scenario.nodeLoading, [node]: value },
			nodeError: { ...scenario.nodeError, [node]: value ? false : scenario.nodeError[node] }
		});
	}

	function setNodeContext(node: MagiNodeName, level: ContextLevel) {
		onchange({ ...scenario, nodeContext: { ...scenario.nodeContext, [node]: level } });
	}

	function setConsensusContext(level: ContextLevel) {
		onchange({ ...scenario, consensusContext: level });
	}

	function setConsensusLoading(value: boolean) {
		onchange({ ...scenario, consensusLoading: value });
	}
</script>

{#snippet toggle(on: boolean, set: (value: boolean) => void)}
	<button
		type="button"
		{disabled}
		class="rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 {on
			? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
			: 'bg-gray-800 text-gray-400 hover:text-white'}"
		onclick={() => set(!on)}
	>
		{on ? 'ON' : 'OFF'}
	</button>
{/snippet}

<div class="w-full magi-popover p-3">
	<div class="flex items-center justify-between">
		<span class="flex items-center gap-1.5 magi-section-header magi-warn">
			<Bug size={13} /> DEBUG · dev only
		</span>
		<button
			type="button"
			class="text-gray-500 transition-colors hover:text-(--magi-text)"
			onclick={onclose}
			aria-label="Close debug panel"
		>
			<X size={14} />
		</button>
	</div>
	<p class="mt-1 magi-meta">Inject error and context-limit UI states without a live request.</p>

	<!-- Per-node error + context controls -->
	<div class="mt-3 flex flex-col gap-1.5">
		{#each assignments as assignment (assignment.node)}
			<div class="flex items-center gap-2">
				<span class="flex min-w-0 flex-1 items-center gap-1.5 magi-label">
					<span
						class="h-2 w-2 shrink-0 rounded-full"
						style="background: {NODE_HEX_COLORS[assignment.node]}"
					></span>
					<span class="truncate">{nodeLabels[assignment.node]}</span>
				</span>
				<button
					type="button"
					{disabled}
					class="rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 {scenario
						.nodeError[assignment.node]
						? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/40'
						: 'bg-gray-800 text-gray-400 hover:text-white'}"
					onclick={() => setNodeError(assignment.node, !scenario.nodeError[assignment.node])}
				>
					Error
				</button>
				<button
					type="button"
					{disabled}
					title="Show the pulsating loading state for this node"
					class="rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 {scenario
						.nodeLoading[assignment.node]
						? 'bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/40'
						: 'bg-gray-800 text-gray-400 hover:text-white'}"
					onclick={() => setNodeLoading(assignment.node, !scenario.nodeLoading[assignment.node])}
				>
					Load
				</button>
				<select
					class="magi-select focus:ring-1 focus:ring-gray-500 focus:outline-none"
					value={scenario.nodeContext[assignment.node]}
					disabled={disabled ||
						scenario.nodeError[assignment.node] ||
						scenario.nodeLoading[assignment.node]}
					onchange={(e) => setNodeContext(assignment.node, e.currentTarget.value as ContextLevel)}
				>
					{#each CONTEXT_LEVELS as level (level)}
						<option value={level}>{CONTEXT_LABELS[level]}</option>
					{/each}
				</select>
			</div>
		{/each}
	</div>

	<div class="mt-3 border-t border-gray-800"></div>

	<!-- Consensus + global states -->
	<div class="mt-3 flex flex-col gap-2">
		<div class="flex items-center gap-2">
			<span class="flex-1 magi-label">Consensus</span>
			<button
				type="button"
				{disabled}
				title="Show the strategy-flavoured sweeping verb loader on the consensus pane"
				class="rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-50 {scenario.consensusLoading
					? 'bg-yellow-500/20 text-yellow-300 ring-1 ring-yellow-500/40'
					: 'bg-gray-800 text-gray-400 hover:text-white'}"
				onclick={() => setConsensusLoading(!scenario.consensusLoading)}
			>
				Load
			</button>
			<select
				class="rounded bg-gray-800 py-1 pr-6 pl-2 text-xs text-gray-300 focus:ring-1 focus:ring-gray-500 focus:outline-none disabled:opacity-50"
				value={scenario.consensusContext}
				disabled={disabled || scenario.consensusLoading}
				onchange={(e) => setConsensusContext(e.currentTarget.value as ContextLevel)}
			>
				{#each CONTEXT_LEVELS as level (level)}
					<option value={level}>{CONTEXT_LABELS[level]}</option>
				{/each}
			</select>
		</div>
		<div class="flex items-center justify-between">
			<span class="magi-label">Global error banner</span>
			{@render toggle(scenario.globalError, (v) => onchange({ ...scenario, globalError: v }))}
		</div>
		<div class="flex items-center justify-between">
			<span class="magi-label">Partial-consensus warning</span>
			{@render toggle(scenario.partialConsensus, (v) =>
				onchange({ ...scenario, partialConsensus: v })
			)}
		</div>
	</div>

	<button
		type="button"
		class="mt-3 flex w-full items-center justify-center gap-1.5 rounded bg-gray-800 py-1.5 magi-label transition-colors hover:bg-gray-700 hover:text-white"
		onclick={onopencatalog}
	>
		<CircleHelp size={13} /> View states catalog
	</button>

	<button
		type="button"
		{disabled}
		class="mt-1.5 w-full rounded bg-gray-800 py-1.5 magi-label transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-50"
		onclick={() => onchange(freshDebugScenario())}
	>
		Reset all
	</button>
</div>
