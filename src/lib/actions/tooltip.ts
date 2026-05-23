// A lightweight hover tooltip — faster and styleable, unlike the native `title`
// attribute (whose ~1.5s delay isn't configurable). Use as `use:tooltip={text}`.
// Renders a fixed-position bubble into <body>, positioned above the element
// (flipping below when there's no room), clamped to the viewport.

const SHOW_DELAY = 150;

export function tooltip(node: HTMLElement, text: string | undefined) {
	let tip: HTMLDivElement | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let current = text;

	function place() {
		if (!tip) return;
		const r = node.getBoundingClientRect();
		const t = tip.getBoundingClientRect();
		let top = r.top - t.height - 6;
		if (top < 6) top = r.bottom + 6; // flip below when there's no room above
		let left = r.left + r.width / 2 - t.width / 2;
		left = Math.max(6, Math.min(left, window.innerWidth - t.width - 6));
		tip.style.top = `${top}px`;
		tip.style.left = `${left}px`;
	}

	function show() {
		if (!current || tip) return;
		tip = document.createElement('div');
		tip.className = 'magi-tooltip';
		tip.textContent = current;
		document.body.appendChild(tip);
		place();
	}

	function hide() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		tip?.remove();
		tip = null;
	}

	function onEnter() {
		if (timer) clearTimeout(timer);
		timer = setTimeout(show, SHOW_DELAY);
	}

	node.addEventListener('mouseenter', onEnter);
	node.addEventListener('mouseleave', hide);
	// A click (e.g. toggling the button) shouldn't leave a stale tooltip behind.
	node.addEventListener('click', hide);

	return {
		update(next: string | undefined) {
			current = next;
			if (tip) {
				if (next) {
					tip.textContent = next;
					place();
				} else {
					hide();
				}
			}
		},
		destroy() {
			hide();
			node.removeEventListener('mouseenter', onEnter);
			node.removeEventListener('mouseleave', hide);
			node.removeEventListener('click', hide);
		}
	};
}
