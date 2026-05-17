<script lang="ts">
	import { formatTokenCount } from '$lib/magi/types';

	interface Props {
		input: number;
		output: number;
		/** Append a combined "· total" count. */
		total?: boolean;
		/** Mark the figures as a pre-completion estimate with a ~ prefix. */
		estimated?: boolean;
	}

	let { input, output, total = false, estimated = false }: Props = $props();

	// The single source of truth for how a token count reads anywhere in the UI:
	// compact ↑input ↓output, optionally a combined total, optionally estimated.
	// ↑ is dropped when input is 0 (e.g. a turn still streaming its output).
	const text = $derived.by(() => {
		const mark = estimated ? '~' : '';
		const inPart = input > 0 ? `↑${formatTokenCount(input)} ` : '';
		const outPart = `↓${mark}${formatTokenCount(output)}`;
		const totalPart = total && input > 0 ? ` · ${mark}${formatTokenCount(input + output)}` : '';
		return inPart + outPart + totalPart;
	});
</script>

<span class="magi-token-count font-mono whitespace-nowrap tabular-nums">{text}</span>
