// A focus trap for modal dialogs. Use as `use:focusTrap={{ onescape }}` on the
// dialog container. It:
//   - focuses the first tabbable element inside the container on mount (or the
//     element matching `initial`, if given),
//   - keeps Tab / Shift+Tab cycling within the container (wrapping at the ends,
//     and pulling focus back in if it ever escapes),
//   - calls `onescape` when Escape is pressed,
//   - restores focus to whatever was focused before the trap mounted, on destroy.
//
// Replaces the per-modal hand-rolled traps so every dialog behaves identically.

interface FocusTrapOptions {
	/** Called when Escape is pressed while the trap is active. */
	onescape?: () => void;
	/** CSS selector for the element to focus on mount; defaults to the first tabbable. */
	initial?: string;
}

// Standard tabbable selector. `[tabindex="-1"]` is excluded so click-only
// affordances (e.g. a dismiss backdrop) stay out of the keyboard cycle.
const TABBABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusTrap(node: HTMLElement, options: FocusTrapOptions = {}) {
	const previousFocus = document.activeElement;

	function tabbables(): HTMLElement[] {
		// Visible only — `offsetParent` is null for `display:none` / detached nodes.
		return Array.from(node.querySelectorAll<HTMLElement>(TABBABLE)).filter(
			(el) => el.offsetParent !== null
		);
	}

	function focusInitial() {
		const target =
			(options.initial && node.querySelector<HTMLElement>(options.initial)) || tabbables()[0];
		target?.focus();
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			options.onescape?.();
			return;
		}
		if (e.key !== 'Tab') return;
		const items = tabbables();
		if (items.length === 0) return;
		const first = items[0];
		const last = items[items.length - 1];
		const active = document.activeElement;
		// Focus escaped the dialog (or sits on a non-tabbable child) — pull it back.
		if (!node.contains(active)) {
			e.preventDefault();
			(e.shiftKey ? last : first).focus();
			return;
		}
		if (e.shiftKey && active === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && active === last) {
			e.preventDefault();
			first.focus();
		}
	}

	focusInitial();
	// Capture phase so Tab is intercepted before any inner handler.
	window.addEventListener('keydown', onKeydown, true);

	return {
		update(next: FocusTrapOptions = {}) {
			options = next;
		},
		destroy() {
			window.removeEventListener('keydown', onKeydown, true);
			if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
				previousFocus.focus();
			}
		}
	};
}
