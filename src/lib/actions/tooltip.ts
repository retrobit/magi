// A lightweight hover tooltip — faster and styleable, unlike the native `title`
// attribute (whose ~1.5s delay isn't configurable). Use as `use:tooltip={text}`
// or `use:tooltip={{ text, touch: false }}` to suppress the touch behavior on a
// control whose tap already opens something (so the bubble can't double up over
// the thing it opened). Renders a fixed-position bubble into <body>, positioned
// above the element (flipping below when there's no room), clamped to the viewport.
//
// Touch handling: a tooltip reveals on the *click* the tap produces — i.e. AFTER
// the control has acted (a toggle has flipped, so the bubble shows the new state
// rather than flashing/swapping mid-switch) — then auto-hides. No long-press: it
// fought iOS's native text-selection / callout. For non-actioning hosts
// (truncated text) this is plain tap-to-peek. The synthesized mouse events a tap
// fires are ignored for a beat so the hover path can't pop a tooltip too.
//
// Keyboard / SR: focusin shows immediately (deliberate action); focusout hides.
// While visible the bubble gets role="tooltip" + a unique id, and the host
// carries aria-describedby pointing at that id so screen readers announce it.

const SHOW_DELAY = 150;
const TOUCH_VISIBLE_MS = 1800;
// A tap synthesizes mouse events shortly after touchend; treat a click within
// this window of a touch as touch-originated, and ignore the hover path then.
const SYNTH_MOUSE_GUARD_MS = 700;

let tooltipSeq = 0;

type TooltipParam = string | { text?: string; touch?: boolean } | undefined;

function normalize(p: TooltipParam): { text: string | undefined; touch: boolean } {
	if (p === undefined || typeof p === 'string') return { text: p, touch: true };
	return { text: p.text, touch: p.touch ?? true };
}

export function tooltip(node: HTMLElement, param: TooltipParam) {
	let { text: current, touch: touchEnabled } = normalize(param);
	let tip: HTMLDivElement | null = null;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let touchAutoHide: ReturnType<typeof setTimeout> | null = null;
	let showSoon: ReturnType<typeof setTimeout> | null = null;
	let touchOutsideHandler: ((e: Event) => void) | null = null;
	let lastTouch = 0;
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
		if (showSoon) {
			clearTimeout(showSoon);
			showSoon = null;
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
		// Ignore the mouseenter synthesized right after a tap — otherwise the hover
		// path would pop a tooltip on a control the touch path means to handle.
		if (Date.now() - lastTouch < SYNTH_MOUSE_GUARD_MS) return;
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

	function onTouch() {
		lastTouch = Date.now();
	}

	// The click a tap produces fires after the control's own handler, so defer one
	// turn and re-show: by then a toggle has flipped and update() has refreshed the
	// text, so the bubble reads the NEW state instead of flashing the old one.
	function onClick() {
		const touched = Date.now() - lastTouch < SYNTH_MOUSE_GUARD_MS;
		if (!touched) {
			// Desktop click (e.g. toggling) shouldn't leave a stale hover tooltip.
			if (!touchOutsideHandler) hide();
			return;
		}
		if (!touchEnabled || !current) {
			hide();
			return;
		}
		hide();
		showSoon = setTimeout(() => {
			showSoon = null;
			show();
			touchAutoHide = setTimeout(hide, TOUCH_VISIBLE_MS);
			touchOutsideHandler = (ev) => {
				if (!(ev.target instanceof Node) || !node.contains(ev.target)) hide();
			};
			document.addEventListener('touchstart', touchOutsideHandler, true);
		}, 0);
	}

	node.addEventListener('mouseenter', onEnter);
	node.addEventListener('mouseleave', hide);
	node.addEventListener('focusin', onFocusIn);
	node.addEventListener('focusout', hide);
	node.addEventListener('touchstart', onTouch, { passive: true });
	node.addEventListener('touchend', onTouch, { passive: true });
	node.addEventListener('click', onClick);

	return {
		update(next: TooltipParam) {
			const n = normalize(next);
			current = n.text;
			touchEnabled = n.touch;
			if (tip) {
				if (current) {
					tip.textContent = current;
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
			node.removeEventListener('touchstart', onTouch);
			node.removeEventListener('touchend', onTouch);
			node.removeEventListener('click', onClick);
		}
	};
}
