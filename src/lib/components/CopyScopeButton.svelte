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
	let menuPos = $state({ top: 0, right: 0 });

	function flashCopied() {
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}

	function copyScope(content: string) {
		if (!content) return;
		navigator.clipboard.writeText(content).catch(() => {});
		flashCopied();
	}

	function copyDefault() {
		const def = scopes.find((s) => s.id === defaultId);
		if (def) copyScope(def.content);
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
		if (e.key === 'Escape') open = false;
	}
	function onWindowScroll() {
		open = false;
	}
	function onSelect(scope: CopyScope) {
		copyScope(scope.content);
		open = false;
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
		class="rounded-l p-0.5 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
		onclick={copyDefault}
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
		class="rounded-r p-0.5 text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
		onclick={toggleMenu}
		aria-haspopup="menu"
		aria-expanded={open}
		title="Copy options"
	>
		<ChevronDown size={11} class="transition-transform {open ? 'rotate-180' : ''}" />
	</button>
</div>

{#if open}
	<!-- Outside-click backdrop. -->
	<button
		class="fixed inset-0 z-40 cursor-default"
		onclick={() => (open = false)}
		aria-label="Close copy options"
	></button>
	<div
		class="fixed z-50 flex w-56 flex-col gap-0.5 rounded-lg border border-gray-700 bg-gray-900 p-1 shadow-xl"
		style:top="{menuPos.top}px"
		style:right="{menuPos.right}px"
		role="menu"
	>
		{#each scopes as scope (scope.id)}
			<button
				type="button"
				role="menuitem"
				class="flex items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs text-gray-200 transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
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
