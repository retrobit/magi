/** True when the user prefers reduced motion — either the OS-level media query
 *  or the in-app `.reduce-motion` class on <html> (the Settings toggle). */
export function prefersReducedMotion(): boolean {
	if (typeof window === 'undefined') return false;
	return (
		window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true ||
		document.documentElement.classList.contains('reduce-motion')
	);
}

/** Scroll `el` to the absolute `top` offset, gliding there smoothly unless the
 *  user prefers reduced motion (then it jumps instantly). Used by the snap-scroll
 *  effects so the panel slides to the new turn / round / synthesis instead of
 *  hard-cutting to it. */
export function smoothSnap(el: HTMLElement, top: number): void {
	el.scrollTo({ top, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
}
