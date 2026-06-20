<script lang="ts">
	// Editor for the three MAGI temperaments (the "edit personas in place"
	// feature). Each seat keeps its slot but its name + persona text are editable;
	// a blank field falls back to the built-in default, and a per-seat reset
	// restores both. The caller owns visibility (mount behind an `{#if}`) and
	// persists whatever `onsave` hands back — a sparse map holding only the seats
	// that actually differ from their defaults.
	import { RotateCcw, X } from 'lucide-svelte';
	import { focusTrap } from '$lib/actions/focusTrap';
	import { MAGI_NODE_NAMES, NODE_COLOR_VARS, type MagiNodeName } from '$lib/magi/types';
	import {
		defaultNodeTemperament,
		MAX_TEMPERAMENT_LABEL,
		MAX_TEMPERAMENT_PROMPT,
		type CustomTemperaments
	} from '$lib/magi/temperaments';

	interface Props {
		/** The currently-saved overrides — seeds the editor. */
		value: CustomTemperaments;
		/** Seat labels to show (code names or generic MAGI numbers, per the toggle). */
		labels: Record<MagiNodeName, string>;
		onsave: (next: CustomTemperaments) => void;
		onclose: () => void;
	}

	let { value, labels, onsave, onclose }: Props = $props();

	// Working copy, seeded from the saved override or the built-in default per seat.
	let draft = $state(
		Object.fromEntries(
			MAGI_NODE_NAMES.map((node) => {
				const def = defaultNodeTemperament(node);
				const o = value[node];
				return [node, { label: o?.label ?? def.label, prompt: o?.prompt ?? def.prompt }];
			})
		) as Record<MagiNodeName, { label: string; prompt: string }>
	);

	// A seat is "at default" when each field is either blank (falls back) or equal
	// to the built-in — so a blank persona doesn't get persisted as an override.
	function isDefault(node: MagiNodeName): boolean {
		const def = defaultNodeTemperament(node);
		const label = draft[node].label.trim();
		const prompt = draft[node].prompt.trim();
		return (label === '' || label === def.label) && (prompt === '' || prompt === def.prompt);
	}

	function resetNode(node: MagiNodeName) {
		const def = defaultNodeTemperament(node);
		draft[node] = { label: def.label, prompt: def.prompt };
	}

	function save() {
		const next: CustomTemperaments = {};
		for (const node of MAGI_NODE_NAMES) {
			if (!isDefault(node)) {
				next[node] = { label: draft[node].label.trim(), prompt: draft[node].prompt.trim() };
			}
		}
		onsave(next);
		onclose();
	}
</script>

<button
	class="fixed inset-0 z-50 cursor-default bg-black/60 backdrop-blur-sm"
	onclick={onclose}
	aria-label="Close"
	tabindex="-1"
></button>
<div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
	<!-- Focus trap: lands on the first name field, keeps Tab cycling inside the
	     dialog (honoring aria-modal), closes on Escape, restores focus on unmount. -->
	<div
		class="pointer-events-auto flex max-h-[85vh] w-full max-w-2xl flex-col magi-popover"
		role="dialog"
		aria-modal="true"
		aria-labelledby="temperament-editor-title"
		use:focusTrap={{ onescape: onclose, initial: 'input' }}
	>
		<div class="flex items-start justify-between gap-4 border-b border-(--magi-border) p-5 pb-4">
			<div>
				<h2 id="temperament-editor-title" class="text-sm font-semibold text-(--magi-text)">
					Edit temperaments
				</h2>
				<p class="mt-1 text-xs leading-relaxed text-(--magi-text-muted)">
					Give each MAGI its own name and persona. Applied as a system instruction when Temperaments
					are on; leave a field blank to keep the built-in default.
				</p>
			</div>
			<button
				type="button"
				class="-mt-1 -mr-1 shrink-0 rounded-md p-1.5 text-(--magi-text-secondary) transition-colors hover:bg-(--magi-surface-hover) hover:text-(--magi-text)"
				onclick={onclose}
				aria-label="Close"
			>
				<X size={16} />
			</button>
		</div>

		<div class="flex flex-col gap-5 overflow-y-auto p-5">
			{#each MAGI_NODE_NAMES as node (node)}
				{@const def = defaultNodeTemperament(node)}
				<section class="flex flex-col gap-2" style:--node-color={`var(${NODE_COLOR_VARS[node]})`}>
					<div class="flex items-center justify-between gap-2">
						<span class="magi-display text-xs font-bold tracking-wide text-(--node-color)"
							>{labels[node]}</span
						>
						<button
							type="button"
							class="flex items-center gap-1 rounded px-1.5 py-0.5 magi-meta text-(--magi-text-secondary) transition-colors hover:bg-(--magi-surface-hover) hover:text-(--magi-text) disabled:opacity-50 disabled:hover:bg-transparent"
							onclick={() => resetNode(node)}
							disabled={isDefault(node)}
						>
							<RotateCcw size={11} /> Reset to {def.label}
						</button>
					</div>
					<input
						bind:value={draft[node].label}
						type="text"
						maxlength={MAX_TEMPERAMENT_LABEL}
						placeholder={def.label}
						aria-label="{labels[node]} temperament name"
						class="magi-input w-full rounded-md px-3 py-1.5 text-sm focus:border-(--magi-ring) focus:ring-1 focus:ring-(--magi-ring) focus:outline-none"
					/>
					<textarea
						bind:value={draft[node].prompt}
						rows="4"
						maxlength={MAX_TEMPERAMENT_PROMPT}
						placeholder={def.prompt}
						aria-label="{labels[node]} persona"
						class="magi-input w-full resize-y rounded-md px-3 py-2 text-sm leading-relaxed focus:border-(--magi-ring) focus:ring-1 focus:ring-(--magi-ring) focus:outline-none"
					></textarea>
					<div class="text-right magi-meta text-(--magi-text-muted)">
						{draft[node].prompt.length} / {MAX_TEMPERAMENT_PROMPT}
					</div>
				</section>
			{/each}
		</div>

		<div class="flex justify-end gap-2 border-t border-(--magi-border) p-4">
			<button
				type="button"
				class="rounded-md px-3 py-1.5 text-sm text-(--magi-text-secondary) transition-colors hover:bg-(--magi-surface-hover)"
				onclick={onclose}
			>
				Cancel
			</button>
			<button
				type="button"
				class="magi-btn rounded-md px-3 py-1.5 text-sm font-medium transition-colors"
				onclick={save}
			>
				Save
			</button>
		</div>
	</div>
</div>
