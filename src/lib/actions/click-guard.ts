// True when a click landed on (or inside) an interactive control *strictly
// within* the listening element — a button, link, input, select, or anything
// marked interactive. Lets a clickable container (e.g. a panel header that
// cycles the layout) ignore clicks really meant for its own controls, while
// still firing for clicks on the header's bare surface.
//
// The listening element itself is excluded: a header given `role="button"`
// would otherwise match the `[role="button"]` selector and swallow every click.
const CONTROL_SELECTOR =
	'button, a, input, select, textarea, [role="button"], [role="menuitem"], [role="dialog"]';

export function isControlClick(e: Event): boolean {
	const target = e.target;
	if (!(target instanceof Element)) return false;
	const control = target.closest(CONTROL_SELECTOR);
	return control !== null && control !== e.currentTarget;
}
