<script module lang="ts">
	import { Marked } from 'marked';
	import { markedHighlight } from 'marked-highlight';
	import hljs from 'highlight.js/lib/common';
	import DOMPurify from 'dompurify';

	// Escape the HTML specials so an untagged code block renders literally (and can
	// never become live markup). Used by the no-highlight path below.
	function escapeHtml(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	// ONE marked instance shared by every Markdown component. The config is static,
	// so the former per-instance `new Marked()` was pure waste (3 node panels + the
	// consensus panel each built their own).
	const marked = new Marked(
		markedHighlight({
			emptyLangClass: 'hljs',
			langPrefix: 'hljs language-',
			highlight(code, lang) {
				// Only highlight when the fence names a language hljs recognizes. The
				// old fallback called hljs.highlightAuto, which probes ~36 languages and
				// ran on EVERY throttled re-parse of the growing stream across up to 4
				// panels (and again per debate round) — by far the heaviest op on the
				// render path. Untagged blocks now render as plain escaped code, which
				// is cheap; auto-detection was frequently wrong on short snippets anyway.
				return lang && hljs.getLanguage(lang)
					? hljs.highlight(code, { language: lang }).value
					: escapeHtml(code);
			}
		})
	);

	// Detection uses a non-global pattern; a /g/ regex carries `lastIndex` between
	// .test() calls and would skip matches across successive text nodes.
	const emojiTest = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u;
	const emojiReplace = /([\p{Emoji_Presentation}\p{Extended_Pictographic}])/gu;

	function wrapEmojisInTextNodes(html: string): string {
		// Fast path: most chunks contain no emoji at all, so skip the DOMParser build
		// and the full text-node walk entirely when there's nothing to wrap.
		if (!emojiTest.test(html)) return html;
		const doc = new DOMParser().parseFromString(html, 'text/html');
		const walker = document.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
		const textNodes: Text[] = [];
		let node: Text | null;
		while ((node = walker.nextNode() as Text | null)) textNodes.push(node);
		for (const tn of textNodes) {
			if (!emojiTest.test(tn.data)) continue;
			// SECURITY: build replacement nodes via textContent only. `tn.data` is
			// DECODED text — a text node like `<img onerror=…>` (escaped in the
			// sanitized HTML, e.g. from inline code) would become live markup if it
			// ever passed through innerHTML, re-opening XSS after DOMPurify ran.
			// Splitting on the capture group alternates [text, emoji, text, …].
			const frag = document.createDocumentFragment();
			const parts = tn.data.split(emojiReplace);
			for (let i = 0; i < parts.length; i += 1) {
				if (parts[i] === '') continue;
				if (i % 2 === 1) {
					const span = document.createElement('span');
					span.className = 'not-italic';
					span.textContent = parts[i];
					frag.appendChild(span);
				} else {
					frag.appendChild(document.createTextNode(parts[i]));
				}
			}
			tn.replaceWith(frag);
		}
		return doc.body.innerHTML;
	}

	function render(src: string): string {
		const raw = marked.parse(src, { async: false, breaks: true, gfm: true }) as string;
		return wrapEmojisInTextNodes(DOMPurify.sanitize(raw));
	}

	// A streamed `source` grows one chunk at a time; re-parsing the whole string on
	// every chunk is O(n²) over a response. Cap re-renders to this interval — the
	// trailing edge still flushes the final text.
	const THROTTLE_MS = 100;
</script>

<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';

	interface Props {
		source: string;
	}

	let { source }: Props = $props();

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
