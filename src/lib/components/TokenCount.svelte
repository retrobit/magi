<script lang="ts">
	import { formatTokenCount } from '$lib/magi/types';

	interface Props {
		input: number;
		output: number;
		/** Append a combined "· total" count. */
		total?: boolean;
		/** Mark the figures as a pre-completion estimate with a ~ prefix. */
		estimated?: boolean;
		/** Prompt-cached slice of `input`; shown as a ⚡ figure when above 0. */
		cached?: number;
	}

	let { input, output, total = false, estimated = false, cached = 0 }: Props = $props();

	// The single source of truth for how a token count reads anywhere in the UI:
	// compact ↑input ↓output, optionally a ⚡cached slice, a combined total, or an
	// estimate mark. ↑ is dropped when input is 0 (e.g. a turn still streaming).
	const text = $derived.by(() => {
		const mark = estimated ? '~' : '';
		const inPart = input > 0 ? `↑${formatTokenCount(input)} ` : '';
		const cachePart = cached > 0 ? `⚡${formatTokenCount(cached)} ` : '';
		const outPart = `↓${formatTokenCount(output)}`;
		const totalPart = total && input > 0 ? ` · ${formatTokenCount(input + output)}` : '';
		return mark + inPart + cachePart + outPart + totalPart;
	});
</script>

<span class="magi-token-count font-mono whitespace-nowrap tabular-nums">{text}</span>
