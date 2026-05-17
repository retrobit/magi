<script lang="ts">
	import { marked } from 'marked';
	import DOMPurify from 'dompurify';
	import { browser } from '$app/environment';

	interface Props {
		source: string;
	}

	let { source }: Props = $props();

	const emojiRegex = /([\p{Emoji_Presentation}\p{Extended_Pictographic}])/gu;

	function wrapEmojisInTextNodes(html: string): string {
		const doc = new DOMParser().parseFromString(html, 'text/html');
		const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
		const textNodes: Text[] = [];
		let node: Text | null;
		while ((node = walker.nextNode() as Text | null)) textNodes.push(node);
		for (const tn of textNodes) {
			if (emojiRegex.test(tn.data)) {
				const span = document.createElement('span');
				span.innerHTML = tn.data.replace(emojiRegex, '<span class="not-italic">$1</span>');
				tn.replaceWith(...span.childNodes);
			}
		}
		return doc.body.innerHTML;
	}

	const html = $derived.by(() => {
		if (!browser) return '';
		const raw = marked.parse(source, { async: false, breaks: true, gfm: true }) as string;
		const clean = DOMPurify.sanitize(raw);
		return wrapEmojisInTextNodes(clean);
	});
</script>

<!-- eslint-disable svelte/no-at-html-tags -- sanitized via DOMPurify -->
{@html html}
