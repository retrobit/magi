<script lang="ts">
	// Split copy button: the icon copies the default scope on click; the
	// adjacent chevron opens a popover listing every available scope. Used by
	// the node panels so a user can grab just the final response (default) or
	// pull in the original query and/or every debate round.
	import { Copy, Check, ChevronDown } from 'lucide-svelte';

	export interface CopyScope {
		/** Stable identifier — used to highlight the default in the menu. */
		id: string;
		label: string;
		content: string;
	}

	interface Props {
		/** The scope copied by clicking the icon directly. Must also appear in `scopes`. */
		defaultId: string;
		scopes: CopyScope[];
		title?: string;
	}

	let { defaultId, scopes, title = 'Copy' }: Props = $props();

	let open = $state(false);
	let copied = $state(false);
	let triggerEl = $state<HTMLDivElement | null>(null);
	let chevronEl = $state<HTMLButtonElement | null>(null);
	let menuPos = $state({ top: 0, right: 0 });
	// Announced politely to assistive tech on a successful copy — the icon swap
	// alone is silent to a screen reader.
	let liveMessage = $state('');

	function flashCopied() {
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	function copyScope(scope: CopyScope) {
		if (!scope.content) return;
		navigator.clipboard.writeText(scope.content).catch(() => {});
		liveMessage = `Copied ${scope.label}`;
		flashCopied();
	}

	function copyDefault() {
		const def = scopes.find((s) => s.id === defaultId);
		if (def) copyScope(def);
	}

	function measure() {
		if (!triggerEl) return;
		const r = triggerEl.getBoundingClientRect();
		// Right-align the menu under the split button so it doesn't run off the
		// node panel on small viewports.
		menuPos = { top: r.bottom + 4, right: window.innerWidth - r.right };
	}

	function toggleMenu() {
		if (!open) measure();
		open = !open;
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
			chevronEl?.focus();
		}
	}
	function onWindowScroll() {
		open = false;
	}
	function onSelect(scope: CopyScope) {
		copyScope(scope);
		open = false;
		chevronEl?.focus();
	}

	// APG menu keyboard model: roving DOM focus across the menuitems, skipping
	// disabled (empty-content) scopes since native disabled buttons can't hold focus.
	let menuItemRefs: HTMLButtonElement[] = [];

	function enabledIndices(): number[] {
		return scopes.map((s, i) => (s.content ? i : -1)).filter((i) => i >= 0);
	}
	function focusAt(idx: number | undefined) {
		if (idx !== undefined) menuItemRefs[idx]?.focus();
	}
	function focusEdge(which: 'first' | 'last') {
		const e = enabledIndices();
		focusAt(which === 'first' ? e[0] : e[e.length - 1]);
	}
	function step(dir: 1 | -1) {
		const e = enabledIndices();
		if (!e.length) return;
		const current = menuItemRefs.findIndex((el) => el === document.activeElement);
		const pos = e.indexOf(current);
		if (pos === -1) {
			focusAt(e[0]);
			return;
		}
		focusAt(e[Math.max(0, Math.min(e.length - 1, pos + dir))]);
	}

	// On open, land focus on the first selectable item so arrow keys flow.
	$effect(() => {
		if (open) focusEdge('first');
	});

	function onMenuKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault();
			step(1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			step(-1);
		} else if (e.key === 'Home') {
			e.preventDefault();
			focusEdge('first');
		} else if (e.key === 'End') {
			e.preventDefault();
			focusEdge('last');
		}
	}

	// Down/Up on the closed chevron opens the menu (the $effect then lands focus).
	function onChevronKeydown(e: KeyboardEvent) {
		if (open) return;
		if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
			e.preventDefault();
			measure();
			open = true;
		}
	}
</script>

<svelte:window
	onkeydown={open ? onKeydown : undefined}
	onresize={open ? measure : undefined}
	onscroll={open ? onWindowScroll : undefined}
/>

<div bind:this={triggerEl} class="inline-flex items-center">
	<button
		type="button"
		class="rounded-l p-0.5 text-(--magi-text-muted) transition-colors hover:bg-(--magi-surface-hover) hover:text-(--magi-text)"
		onclick={copyDefault}
		aria-label={copied ? 'Copied' : title}
		{title}
	>
		{#if copied}
			<Check size={14} class="magi-success" />
		{:else}
			<Copy size={14} />
		{/if}
	</button>
	<button
		type="button"
		bind:this={chevronEl}
		class="rounded-r p-0.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
		onclick={toggleMenu}
		onkeydown={onChevronKeydown}
		aria-haspopup="menu"
		aria-expanded={open}
		title="Copy options"
	>
		<ChevronDown size={11} class="transition-transform {open ? 'rotate-180' : ''}" />
	</button>
	<span class="sr-only" aria-live="polite" role="status">{liveMessage}</span>
</div>

{#if open}
	<!-- Outside-click backdrop. -->
	<button
		class="fixed inset-0 z-40 cursor-default"
		onclick={() => (open = false)}
		aria-label="Close copy options"
	></button>
	<div
		class="fixed z-50 flex w-56 flex-col gap-0.5 magi-popover p-1"
		style:top="{menuPos.top}px"
		style:right="{menuPos.right}px"
		role="menu"
		tabindex={-1}
		onkeydown={onMenuKeydown}
	>
		{#each scopes as scope, i (scope.id)}
			<button
				type="button"
				role="menuitem"
				bind:this={menuItemRefs[i]}
				class="flex items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs text-(--magi-text-secondary) transition-colors hover:bg-gray-800 hover:text-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
				onclick={() => onSelect(scope)}
				disabled={!scope.content}
			>
				<span>{scope.label}</span>
				{#if scope.id === defaultId}
					<span class="magi-meta text-gray-500">default</span>
				{/if}
			</button>
		{/each}
	</div>
{/if}
