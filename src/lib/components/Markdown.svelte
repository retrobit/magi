<script module lang="ts">
	import { Marked } from 'marked';
	import { markedHighlight } from 'marked-highlight';
	import { highlighter } from '$lib/highlight-loader.svelte';
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
				// The highlighter is lazy-loaded (see highlight-loader) — null until it
				// resolves, so early fences render as plain escaped code and re-highlight
				// once it's ready (reading highlighter() inside the render effect wires
				// that up). Only highlight fences naming a language it recognizes; untagged
				// blocks stay plain escaped code (cheap, and auto-detect was often wrong on
				// short snippets anyway).
				const hljs = highlighter();
				return hljs && lang && hljs.getLanguage(lang)
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

	// Model HTML may carry only the classes this pipeline itself emits: highlight.js
	// tokens (`hljs`, `hljs-*`, sub-scopes such as `function_`), the fence's
	// `language-*`, and the emoji wrapper. Everything else is dropped, so a reply
	// can't borrow the app's own utility classes (`fixed inset-0 …`) to cover the UI.
	const ALLOWED_CLASS = /^(?:hljs(?:-[\w-]+)?|language-\S+|[a-z]+_{1,2}|not-italic)$/;
	// isSupported is false where there is no DOM (server import) — no hook API there.
	if (DOMPurify.isSupported) {
		DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
			if (data.attrName !== 'class') return;
			data.attrValue = data.attrValue
				.split(/\s+/)
				.filter((c) => ALLOWED_CLASS.test(c))
				.join(' ');
			if (!data.attrValue) data.keepAttr = false;
		});
		// The one <input> markdown produces is a GFM task-list checkbox. Keep that,
		// inert, and drop every other kind — a password or submit field inside an
		// answer is a fake prompt even though nothing can post it anywhere.
		DOMPurify.addHook('afterSanitizeAttributes', (node) => {
			if (node.nodeName !== 'INPUT') return;
			if (node.getAttribute('type') === 'checkbox') node.setAttribute('disabled', '');
			else node.remove();
		});
	}

	// What untrusted model HTML may not bring, beyond DOMPurify's script-level
	// defaults. Markdown + hljs emit none of these, so nothing legitimate is lost:
	// - `style` attribute and <style> element: restyle, hide or overlay the app.
	// - form controls and <dialog>: a fake prompt inside an answer. (<input> is
	//   narrowed to disabled checkboxes by the hook above, for GFM task lists.)
	// - `id` / `name`: DOM clobbering and hijacking the app's own anchors/labels.
	const SANITIZE_CONFIG = {
		FORBID_TAGS: ['style', 'form', 'textarea', 'select', 'button', 'dialog'],
		FORBID_ATTR: ['style', 'id', 'name']
	};

	function render(src: string): string {
		const raw = marked.parse(src, { async: false, breaks: true, gfm: true }) as string;
		// Sanitize LAST so no DOM transform runs after it (the emoji wrap re-parses
		// and re-serializes, so doing it first keeps DOMPurify the final word — no
		// mXSS re-open).
		return DOMPurify.sanitize(wrapEmojisInTextNodes(raw), SANITIZE_CONFIG);
	}

	// A streamed `source` grows one chunk at a time; re-parsing the whole string on
	// every chunk is O(n²) over a response. Cap re-renders to this interval — the
	// trailing edge still flushes the final text.
	const THROTTLE_MS = 100;
</script>

<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
	import { ensureHighlighter } from '$lib/highlight-loader.svelte';

	// Start the one-time highlighter load (after the shell is interactive). Idempotent.
	ensureHighlighter();

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
