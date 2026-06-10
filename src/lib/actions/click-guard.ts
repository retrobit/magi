/** True when an event landed on an interactive descendant — a form control,
 *  link, or a tooltip anchor (tapping a use:tooltip element is a deliberate
 *  tooltip-peek gesture, not a request to change the layout). Shared by every
 *  click-to-cycle surface so the exclusion list can't drift between copies. */
export function isControlClick(e: Event): boolean {
	const t = e.target;
	return (
		t instanceof HTMLElement &&
		!!t.closest('button, select, a, input, textarea, [data-tooltip-anchor]')
	);
}
