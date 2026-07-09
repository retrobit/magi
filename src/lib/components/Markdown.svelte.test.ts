import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Markdown from './Markdown.svelte';

// The component gates rendering on `browser` — force it on under jsdom.
vi.mock('$app/environment', () => ({ browser: true }));

// Model output is untrusted third-party text. These tests pin the sanitization
// pipeline: DOMPurify strips live markup, and the emoji post-pass must never
// re-parse decoded text back into HTML (the regression that allowed XSS).
async function renderSource(source: string): Promise<HTMLElement> {
	const { container } = render(Markdown, { props: { source } });
	await tick();
	return container;
}

describe('Markdown sanitization', () => {
	it('strips a raw <script> tag', async () => {
		const container = await renderSource('hello <script>window.__pwned = 1</script> world');
		expect(container.querySelector('script')).toBeNull();
		expect(container.textContent).toContain('hello');
	});

	it('strips inline event handlers', async () => {
		const container = await renderSource('<img src="x" onerror="window.__pwned = 1" />');
		expect(container.querySelector('[onerror]')).toBeNull();
	});

	it('strips the style attribute so model HTML cannot position/overlay the app', async () => {
		const container = await renderSource(
			'<div style="position:fixed;inset:0;z-index:9999">overlay</div>'
		);
		expect(container.querySelector('[style]')).toBeNull();
		expect(container.textContent).toContain('overlay');
	});

	it('does not revive escaped markup that sits next to an emoji (XSS regression)', async () => {
		// Inline code renders the payload as TEXT (`&lt;img …&gt;` in the HTML).
		// The emoji in the same text node used to route it through innerHTML,
		// re-parsing the decoded text into a live <img onerror> element.
		const container = await renderSource('`🙂 <img src=x onerror=window.__pwned=1>`');
		expect(container.querySelector('img')).toBeNull();
		expect(container.querySelector('[onerror]')).toBeNull();
		// The payload survives as visible text, not as markup.
		expect(container.textContent).toContain('<img');
	});

	it('still wraps emojis in not-italic spans with surrounding text intact', async () => {
		const container = await renderSource('before 🙂 after');
		const span = container.querySelector('span.not-italic');
		expect(span?.textContent).toBe('🙂');
		expect(container.textContent).toContain('before');
		expect(container.textContent).toContain('after');
	});

	it('wraps consecutive emojis individually', async () => {
		const container = await renderSource('🔺🔻🔺');
		const spans = container.querySelectorAll('span.not-italic');
		expect(spans).toHaveLength(3);
	});

	it('renders ordinary markdown structures', async () => {
		const container = await renderSource('# Title\n\n- item\n\n`code`');
		expect(container.querySelector('h1')?.textContent).toBe('Title');
		expect(container.querySelector('li')?.textContent).toBe('item');
		expect(container.querySelector('code')?.textContent).toBe('code');
	});
});
