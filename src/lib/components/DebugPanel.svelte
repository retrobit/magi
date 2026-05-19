<script module lang="ts">
	import { MAGI_NODE_NAMES, type MagiNodeName } from '$lib/magi/types';

	/** How full to drive a model's context window: untouched, into the amber
	 *  warning band (≥75%), or into the red critical band (≥90%). */
	export type ContextLevel = 'off' | 'warn' | 'critical';

	/** A declarative description of which error / context-limit UI states the
	 *  dev debug panel is currently injecting. Applied imperatively by the page. */
	export interface DebugScenario {
		nodeError: Record<MagiNodeName, boolean>;
		nodeContext: Record<MagiNodeName, ContextLevel>;
		consensusContext: ContextLevel;
		globalError: boolean;
		partialConsensus: boolean;
	}

	export function freshDebugScenario(): DebugScenario {
		return {
			nodeError: { MELCHIOR: false, BALTHASAR: false, CASPAR: false },
			nodeContext: { MELCHIOR: 'off', BALTHASAR: 'off', CASPAR: 'off' },
			consensusContext: 'off',
			globalError: false,
			partialConsensus: false
		};
	}

	/** True when the scenario injects anything — drives whether the page shows
	 *  a synthetic turn or falls back to its normal idle state. */
	export function isDebugScenarioActive(s: DebugScenario): boolean {
		return (
			MAGI_NODE_NAMES.some((n) => s.nodeError[n] || s.nodeContext[n] !== 'off') ||
			s.consensusContext !== 'off' ||
			s.globalError ||
			s.partialConsensus
		);
	}
</script>

<script lang="ts">
	import type { NodeAssignment } from '$lib/magi/config';
	import { NODE_HEX_COLORS } from '$lib/magi/types';
	import { Bug, X } from 'lucide-svelte';

	interface Props {
		scenario: DebugScenario;
		assignments: NodeAssignment[];
		disabled?: boolean;
		onchange: (scenario: DebugScenario) => void;
		onclose: () => void;
	}

	let { scenario, assignments, disabled = false, onchange, onclose }: Props = $props();

	const CONTEXT_LEVELS: ContextLevel[] = ['off', 'warn', 'critical'];
	const CONTEXT_LABELS: Record<ContextLevel, string> = {
		off: 'Context OK',
		warn: 'Context 80%',
		critical: 'Context 95%'
	};

	function setNodeError(node: MagiNodeName, value: boolean) {
		onchange({ ...scenario, nodeError: { ...scenario.nodeError, [node]: value } });
	}

	function setNodeContext(node: MagiNodeName, level: ContextLevel) {
		onchange({ ...scenario, nodeContext: { ...scenario.nodeContext, [node]: level } });
	}

	function setConsensusContext(level: ContextLevel) {
		onchange({ ...scenario, consensusContext: level });
	}
</script>

{#snippet toggle(on: boolean, set: (value: boolean) => void)}
	<button
		type="button"
		{disabled}
		class="rounded px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 {on
			? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
			: 'bg-gray-800 text-gray-400 hover:text-white'}"
		onclick={() => set(!on)}
	>
		{on ? 'ON' : 'OFF'}
	</button>
{/snippet}

<div class="w-80 rounded-lg border border-gray-700 bg-gray-900 p-3 shadow-xl">
	<div class="flex items-center justify-between">
		<span class="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-amber-400">
			<Bug size={13} /> DEBUG · dev only
		</span>
		<button
			type="button"
			class="text-gray-500 transition-colors hover:text-white"
			onclick={onclose}
			aria-label="Close debug panel"
		>
			<X size={14} />
		</button>
	</div>
	<p class="mt-1 text-[10px] text-gray-500">
		Inject error and context-limit UI states without a live request.
	</p>

	<!-- Per-node error + context controls -->
	<div class="mt-3 flex flex-col gap-1.5">
		{#each assignments as assignment (assignment.node)}
			<div class="flex items-center gap-2">
				<span class="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-gray-300">
					<span
						class="h-2 w-2 shrink-0 rounded-full"
						style="background: {NODE_HEX_COLORS[assignment.node]}"
					></span>
					<span class="truncate">{assignment.node}</span>
				</span>
				<button
					type="button"
					{disabled}
					class="rounded px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-50 {scenario
						.nodeError[assignment.node]
						? 'bg-red-500/20 text-red-300 ring-1 ring-red-500/40'
						: 'bg-gray-800 text-gray-400 hover:text-white'}"
					onclick={() => setNodeError(assignment.node, !scenario.nodeError[assignment.node])}
				>
					Error
				</button>
				<select
					class="rounded bg-gray-800 px-1.5 py-1 text-[11px] text-gray-300 focus:ring-1 focus:ring-gray-500 focus:outline-none disabled:opacity-50"
					value={scenario.nodeContext[assignment.node]}
					disabled={disabled || scenario.nodeError[assignment.node]}
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
			<span class="flex-1 text-xs font-medium text-gray-300">Consensus</span>
			<select
				class="rounded bg-gray-800 px-1.5 py-1 text-[11px] text-gray-300 focus:ring-1 focus:ring-gray-500 focus:outline-none disabled:opacity-50"
				value={scenario.consensusContext}
				{disabled}
				onchange={(e) => setConsensusContext(e.currentTarget.value as ContextLevel)}
			>
				{#each CONTEXT_LEVELS as level (level)}
					<option value={level}>{CONTEXT_LABELS[level]}</option>
				{/each}
			</select>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-xs font-medium text-gray-300">Global error banner</span>
			{@render toggle(scenario.globalError, (v) => onchange({ ...scenario, globalError: v }))}
		</div>
		<div class="flex items-center justify-between">
			<span class="text-xs font-medium text-gray-300">Partial-consensus warning</span>
			{@render toggle(scenario.partialConsensus, (v) =>
				onchange({ ...scenario, partialConsensus: v })
			)}
		</div>
	</div>

	<button
		type="button"
		{disabled}
		class="mt-3 w-full rounded bg-gray-800 py-1.5 text-xs font-medium text-gray-300 transition-colors hover:bg-gray-700 hover:text-white disabled:opacity-50"
		onclick={() => onchange(freshDebugScenario())}
	>
		Reset all
	</button>
</div>
