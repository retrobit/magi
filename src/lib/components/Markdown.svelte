<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';

	interface Props {
		source: string;
	}

	let { source }: Props = $props();

	// A streamed `source` grows one chunk at a time; re-parsing the whole string
	// on every chunk is O(n²) over a response. Cap re-renders to this interval —
	// the trailing edge still flushes the final text.
	const THROTTLE_MS = 100;

	// Detection uses a non-global pattern; a /g/ regex carries `lastIndex` between
	// .test() calls and would skip matches across successive text nodes.
	const emojiTest = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
	const emojiReplace = /([\p{Emoji_Presentation}\p{Extended_Pictographic}])/gu;

	function wrapEmojisInTextNodes(html: string): string {
		const doc = new DOMParser().parseFromString(html, 'text/html');
		const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
		const textNodes: Text[] = [];
		let node: Text | null;
		while ((node = walker.nextNode() as Text | null)) textNodes.push(node);
		for (const tn of textNodes) {
			if (emojiTest.test(tn.data)) {
				const span = document.createElement('span');
				span.innerHTML = tn.data.replace(emojiReplace, '<span class="not-italic">$1</span>');
				tn.replaceWith(...span.childNodes);
			}
		}
		return doc.body.innerHTML;
	}

	function render(src: string): string {
		const raw = marked.parse(src, { async: false, breaks: true, gfm: true }) as string;
		return wrapEmojisInTextNodes(DOMPurify.sanitize(raw));
	}

	let html = $state('');
	let lastRenderAt = 0;
	let pending: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const src = source;
		const elapsed = Date.now() - lastRenderAt;
		if (pending) clearTimeout(pending);
		if (elapsed >= THROTTLE_MS) {
			lastRenderAt = Date.now();
			html = render(src);
		} else {
			pending = setTimeout(() => {
				lastRenderAt = Date.now();
				html = render(src);
				pending = null;
			}, THROTTLE_MS - elapsed);
		}
	});

	onDestroy(() => {
		if (pending) clearTimeout(pending);
	});
</script>

<!-- eslint-disable svelte/no-at-html-tags -- sanitized via DOMPurify -->
{#if browser}{@html html}{/if}
