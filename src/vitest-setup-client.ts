// Registers jest-dom's DOM matchers (toBeInTheDocument, toHaveClass, …) for the
// jsdom-backed component test project.
import '@testing-library/jest-dom/vitest';

// jsdom ships no ResizeObserver; components that observe layout (e.g. the tier
// selector's sliding indicator) construct one on mount. A no-op stub lets them
// mount — the callbacks drive only visual positioning, which jsdom can't
// measure anyway.
if (!('ResizeObserver' in globalThis)) {
	(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}
