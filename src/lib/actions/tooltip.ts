// A lightweight hover tooltip — faster and styleable, unlike the native `title`
// attribute (whose ~1.5s delay isn't configurable). Use as `use:tooltip={text}`.
// Renders a fixed-position bubble into <body>, positioned above the element
// (flipping below when there's no room), clamped to the viewport.
//
// Touch handling: tap shows immediately and stays visible until either
// `TOUCH_AUTO_HIDE_MS` elapses or the user taps outside the element. This is
// the mobile-equivalent of hover-to-peek for cases where content is truncated
// or otherwise hidden behind UI.
//
// Keyboard / SR: focusin shows immediately (deliberate action); focusout hides.
// While visible the bubble gets role="tooltip" + a unique id, and the host
// carries aria-describedby pointing at that id so screen readers announce it.

const SHOW_DELAY = 150;
const TOUCH_AUTO_HIDE_MS = 3000;

let tooltipSeq = 0;

export function tooltip(node: HTMLElement, text: string | undefined) {
	let tip: HTMLDivElement | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let touchAutoHide: ReturnType<typeof setTimeout> | null = null;
	let touchOutsideHandler: ((e: Event) => void) | null = null;
	let current = text;
	let tipId: string | null = null;

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
		tipId = `magi-tooltip-${++tooltipSeq}`;
		tip = document.createElement('div');
		tip.className = 'magi-tooltip';
		tip.textContent = current;
		tip.id = tipId;
		tip.setAttribute('role', 'tooltip');
		document.body.appendChild(tip);
		node.setAttribute('aria-describedby', tipId);
		place();
	}

	function hide() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		if (touchAutoHide) {
			clearTimeout(touchAutoHide);
			touchAutoHide = null;
		}
		if (touchOutsideHandler) {
			document.removeEventListener('touchstart', touchOutsideHandler, true);
			touchOutsideHandler = null;
		}
		tip?.remove();
		tip = null;
		tipId = null;
		node.removeAttribute('aria-describedby');
	}

	function onEnter() {
		if (timer) clearTimeout(timer);
		timer = setTimeout(show, SHOW_DELAY);
	}

	// Keyboard users have already made a deliberate navigation action — show at
	// once. But only for KEYBOARD focus: a click that returns focus to the control
	// (e.g. a menu/listbox closing back onto its trigger) must not pop a tooltip
	// and leave it stuck with the pointer elsewhere. `:focus-visible` is exactly
	// that distinction — true for keyboard focus, false for pointer-driven focus.
	function onFocusIn() {
		if (!node.matches(':focus-visible')) return;
		if (timer) clearTimeout(timer);
		show();
	}

	// Touch: tap shows immediately; stop the synthesized click that would
	// otherwise re-hide via the click handler. Tap elsewhere or wait for the
	// auto-hide timer to dismiss.
	function onTouchStart(e: TouchEvent) {
		if (!current) return;
		e.stopPropagation();
		if (tip) return; // already showing
		show();
		touchAutoHide = setTimeout(hide, TOUCH_AUTO_HIDE_MS);
		touchOutsideHandler = (ev) => {
			if (!(ev.target instanceof Node) || !node.contains(ev.target)) hide();
		};
		document.addEventListener('touchstart', touchOutsideHandler, true);
	}

	node.addEventListener('mouseenter', onEnter);
	node.addEventListener('mouseleave', hide);
	node.addEventListener('focusin', onFocusIn);
	node.addEventListener('focusout', hide);
	node.addEventListener('touchstart', onTouchStart);
	// A click (e.g. toggling the button) shouldn't leave a stale tooltip behind.
	// Touch taps fire click as well, but the auto-hide-on-outside-touch logic
	// above runs first and handles the tooltip lifetime on its own.
	node.addEventListener('click', () => {
		if (!touchOutsideHandler) hide();
	});

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
			node.removeEventListener('focusin', onFocusIn);
			node.removeEventListener('focusout', hide);
			node.removeEventListener('touchstart', onTouchStart);
		}
	};
}
