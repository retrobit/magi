<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { Brain } from 'lucide-svelte';
	import { tooltip } from '$lib/actions/tooltip';

	// A label + ON/OFF toggle. "Not applicable" (`applies` false) is aria-disabled
	// with a no-op click so the toggle stays focusable and announces why it's inert;
	// the stored value is never touched. `disabled` (a run in progress) is a real
	// native `disabled`.
	interface Props {
		/** Visible label text. */
		label: string;
		/** Static tooltip on the label (never on the toggle). */
		tip?: string;
		icon: typeof Brain;
		on: boolean;
		applies?: boolean;
		disabled?: boolean;
		ontoggle: () => void;
		/** Accessible name while the toggle applies (omit to rely on the visible text). */
		ariaLabel?: string;
		/** Accessible name while it doesn't apply. */
		naLabel?: string;
		labelClass?: string;
		class?: string;
		/** Extra controls rendered after the toggle (e.g. an edit button). */
		children?: Snippet;
	}

	let {
		label,
		tip,
		icon: Icon,
		on,
		applies = true,
		disabled = false,
		ontoggle,
		ariaLabel,
		naLabel,
		labelClass = 'text-xs text-(--magi-chrome-label)',
		class: wrapperClass = 'flex items-center gap-2',
		children
	}: Props = $props();
</script>

<div class={wrapperClass}>
	<span class={labelClass} use:tooltip={tip}>{label}</span>
	<button
		type="button"
		class="magi-toggle {on && applies ? 'magi-toggle-on' : ''}"
		onclick={() => applies && ontoggle()}
		{disabled}
		aria-pressed={applies ? on : undefined}
		aria-disabled={applies ? undefined : true}
		aria-label={applies ? ariaLabel : (naLabel ?? ariaLabel)}
	>
		<Icon size={12} />
		<span class="inline-block w-7 text-left">{applies ? (on ? 'ON' : 'OFF') : 'N/A'}</span>
	</button>
	{@render children?.()}
</div>
