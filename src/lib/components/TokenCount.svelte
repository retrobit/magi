<script lang="ts">
	import { formatTokenCount } from '$lib/magi/types';

	interface Props {
		input: number;
		output: number;
		/** Append a combined "· {total}" count — used in the conversation header. */
		total?: boolean;
	}

	let { input, output, total = false }: Props = $props();

	// The single source of truth for how a token count reads anywhere in the UI:
	// compact ↑input ↓output, optionally followed by the combined total.
	const text = $derived(
		`↑${formatTokenCount(input)} ↓${formatTokenCount(output)}` +
			(total ? ` · ${formatTokenCount(input + output)}` : '')
	);
</script>

<span class="magi-token-count font-mono whitespace-nowrap tabular-nums">{text}</span>
