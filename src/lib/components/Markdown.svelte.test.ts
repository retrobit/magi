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

	it('strips a <style> element that follows other content', async () => {
		const container = await renderSource('Answer.\n\n<style>body{display:none}</style>\n\nMore.');
		expect(container.querySelector('style')).toBeNull();
		expect(container.textContent).toContain('More.');
	});

	it('strips form controls but keeps GFM task-list checkboxes', async () => {
		const container = await renderSource(
			'<form action="/x"><textarea>t</textarea><select><option>o</option></select><button>Sign in</button></form>\n\n- [x] done'
		);
		expect(container.querySelector('form, textarea, select, button')).toBeNull();
		expect(container.querySelector('input[type="checkbox"]')).not.toBeNull();
	});

	it('narrows <input> to inert checkboxes, so an answer cannot fake a prompt', async () => {
		const container = await renderSource(
			'<input type="password" placeholder="Re-enter your key"> <input type="submit" value="Sign in"> <input> <input type="checkbox"> <dialog open>Session expired</dialog>'
		);
		const inputs = [...container.querySelectorAll('input')];
		expect(inputs).toHaveLength(1);
		expect(inputs[0].type).toBe('checkbox');
		expect(inputs[0].disabled).toBe(true);
		expect(container.querySelector('dialog')).toBeNull();
	});

	it('strips id and name so model HTML cannot shadow the app’s own elements', async () => {
		const container = await renderSource('<a id="main" name="query" href="#x">link</a>');
		expect(container.querySelector('[id], [name]')).toBeNull();
		expect(container.querySelector('a')?.textContent).toBe('link');
	});

	it('drops app utility classes but keeps the highlighter’s own', async () => {
		const container = await renderSource(
			'<div class="fixed inset-0 z-50 hljs-keyword">cover</div>\n\n```js\nconst a = 1;\n```'
		);
		const div = container.querySelector('div');
		expect(div?.className).toBe('hljs-keyword');
		expect(container.querySelector('.fixed, .inset-0, .z-50')).toBeNull();
		expect(container.querySelector('code')?.className).toBe('hljs language-js');
	});

	it('removes the class attribute outright when nothing in it is allowed', async () => {
		const container = await renderSource('<p class="hidden sr-only">text</p>');
		expect(container.querySelector('p')?.hasAttribute('class')).toBe(false);
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
