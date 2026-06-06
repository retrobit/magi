<script lang="ts">
	// The top bar plus its four header popovers (Debug, Stats, Budget, Settings).
	// Owns its own mutual-exclusion state (`openPanel`) because only one popover
	// is ever open at a time — that's a UI invariant the parent doesn't need to
	// know about.
	import type { Snippet } from 'svelte';
	import { Settings, Bug, BarChart3, Wallet, X, Menu } from 'lucide-svelte';
	import BudgetReadout from './BudgetReadout.svelte';
	import StatsPanel from './StatsPanel.svelte';
	import DebugPanel, { type DebugScenario } from './DebugPanel.svelte';
	import type { NodeAssignment } from '$lib/magi/config';
	import type { ScrollMode } from '$lib/magi/types';

	type HeaderPanel = 'debug' | 'stats' | 'budget' | 'settings' | 'menu';
	type BgVariant = 'columns' | 'orbs' | 'off';

	interface Props {
		theme: 'dark' | 'light';
		bgVariant: BgVariant;
		scrollMode: ScrollMode;
		genericLabels: boolean;
		assignments: [NodeAssignment, NodeAssignment, NodeAssignment];
		loading: boolean;
		debugScenario: DebugScenario;
		statsNonce: number;
		/** Fires when the user picks a new debug scenario from the Debug panel —
		 *  the parent owns the side effect of injecting it into live state. */
		ondebugchange: (next: DebugScenario) => void;
		/** Clicking the header bar (outside any control) fires this — the page
		 *  uses it to advance the focus accordion through all three states. */
		onheadertoggle?: () => void;
	}

	let {
		theme = $bindable(),
		bgVariant = $bindable(),
		scrollMode = $bindable(),
		genericLabels,
		assignments,
		loading,
		debugScenario,
		statsNonce,
		ondebugchange,
		onheadertoggle
	}: Props = $props();

	let openPanel = $state<HeaderPanel | null>(null);
	const togglePanel = (panel: HeaderPanel) => (openPanel = openPanel === panel ? null : panel);

	function isControlClick(e: Event): boolean {
		const t = e.target;
		return t instanceof HTMLElement && !!t.closest('button, select, a, input, textarea');
	}
	function onHeaderClick(e: MouseEvent) {
		if (!onheadertoggle || isControlClick(e)) return;
		onheadertoggle();
	}
	function onHeaderKeydown(e: KeyboardEvent) {
		if (!onheadertoggle) return;
		if (e.target !== e.currentTarget) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			onheadertoggle();
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<header
	class="magi-header relative z-30 shrink-0 border-b border-gray-800 bg-gray-950 select-none"
	class:cursor-pointer={onheadertoggle}
	onclick={onHeaderClick}
	onkeydown={onHeaderKeydown}
	role={onheadertoggle ? 'button' : undefined}
	tabindex={onheadertoggle ? 0 : undefined}
	aria-label={onheadertoggle ? 'Cycle layout focus' : undefined}
>
	<div class="relative mx-auto max-w-7xl px-4 py-4 md:px-6">
		<h1 class="text-center magi-headline">
			MAGI <span class="text-lg">🔺🔻🔺</span>
		</h1>
		<div class="absolute top-1/2 right-4 -translate-y-1/2 md:right-6">
			<!-- Mobile: single hamburger that opens a menu listing every section -->
			<button
				type="button"
				class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white sm:hidden"
				onclick={() => togglePanel('menu')}
				title="Menu"
				aria-label="Open menu"
			>
				<Menu size={16} />
			</button>
			<!-- Tablet/desktop: every section gets its own icon button -->
			<div class="hidden items-center gap-1 sm:flex">
				{#if import.meta.env.DEV}
					<button
						type="button"
						class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-800 hover:text-amber-400"
						onclick={() => togglePanel('debug')}
						title="Debug panel (dev only)"
					>
						<Bug size={16} />
					</button>
				{/if}
				<button
					type="button"
					class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-800 hover:text-green-400"
					onclick={() => togglePanel('stats')}
					title="Stats"
				>
					<BarChart3 size={16} />
				</button>
				<button
					type="button"
					class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-800 hover:text-green-400"
					onclick={() => togglePanel('budget')}
					title="Budget"
				>
					<Wallet size={16} />
				</button>
				<button
					type="button"
					class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
					onclick={() => togglePanel('settings')}
					title="Settings"
				>
					<Settings size={16} />
				</button>
			</div>
		</div>
	</div>
</header>

<!-- Shared scaffold for every header popover: the full-screen click-catcher
     backdrop and the right-aligned positioning wrapper. The body snippet
     renders the panel's own content (and its card chrome, where it has any). -->
{#snippet panelShell(width: string, body: Snippet)}
	<button
		class="fixed inset-0 z-40 cursor-default"
		onclick={() => (openPanel = null)}
		aria-label="Close panel"
	></button>
	<div class="pointer-events-none fixed top-14 right-0 left-0 z-50 mx-auto max-w-7xl px-4 md:px-6">
		<div class="pointer-events-auto ml-auto {width}">
			{@render body()}
		</div>
	</div>
{/snippet}

{#if openPanel === 'menu'}
	{@render panelShell('w-56', menuBody)}
{/if}
{#snippet menuBody()}
	<!-- No explicit close button: the menu is mobile-only and the hamburger
	     itself toggles it; tapping the backdrop also dismisses via panelShell. -->
	<div class="rounded-lg border border-gray-700 bg-gray-900 p-3 shadow-xl">
		<div class="mb-3">
			<span class="magi-section-header text-gray-400">MENU</span>
		</div>
		<div class="flex flex-col gap-1">
			{#if import.meta.env.DEV}
				<button
					type="button"
					class="flex items-center gap-2 rounded px-3 py-1.5 text-left text-sm text-gray-300 transition-colors hover:bg-gray-800 hover:text-amber-400"
					onclick={() => (openPanel = 'debug')}
				>
					<Bug size={14} /> Debug
				</button>
			{/if}
			<button
				type="button"
				class="flex items-center gap-2 rounded px-3 py-1.5 text-left text-sm text-gray-300 transition-colors hover:bg-gray-800 hover:text-green-400"
				onclick={() => (openPanel = 'stats')}
			>
				<BarChart3 size={14} /> Stats
			</button>
			<button
				type="button"
				class="flex items-center gap-2 rounded px-3 py-1.5 text-left text-sm text-gray-300 transition-colors hover:bg-gray-800 hover:text-green-400"
				onclick={() => (openPanel = 'budget')}
			>
				<Wallet size={14} /> Budget
			</button>
			<button
				type="button"
				class="flex items-center gap-2 rounded px-3 py-1.5 text-left text-sm text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
				onclick={() => (openPanel = 'settings')}
			>
				<Settings size={14} /> Settings
			</button>
		</div>
	</div>
{/snippet}

{#if openPanel === 'settings'}
	{@render panelShell('w-48', settingsBody)}
{/if}
{#snippet settingsBody()}
	<div class="rounded-lg border border-gray-700 bg-gray-900 p-3 shadow-xl">
		<div class="mb-3 flex items-center justify-between">
			<span class="flex items-center gap-1.5 magi-section-header text-gray-400">
				<Settings size={13} /> SETTINGS
			</span>
			<button
				type="button"
				class="text-gray-500 transition-colors hover:text-white"
				onclick={() => (openPanel = null)}
				aria-label="Close settings"
			>
				<X size={14} />
			</button>
		</div>
		<span class="magi-label-muted">Theme</span>
		<div class="mt-2 flex flex-col gap-1">
			<button
				class="rounded px-3 py-1.5 text-left text-sm transition-colors {theme === 'dark'
					? 'bg-gray-600 text-white'
					: 'text-gray-400 hover:bg-gray-800 hover:text-white'}"
				onclick={() => (theme = 'dark')}
			>
				Dark
			</button>
			<button
				class="rounded px-3 py-1.5 text-left text-sm transition-colors {theme === 'light'
					? 'bg-gray-600 text-white'
					: 'text-gray-400 hover:bg-gray-800 hover:text-white'}"
				onclick={() => (theme = 'light')}
			>
				Light
			</button>
		</div>
		<span class="mt-3 magi-label-muted">Background</span>
		<div class="mt-2 flex flex-col gap-1">
			<button
				class="rounded px-3 py-1.5 text-left text-sm transition-colors {bgVariant === 'orbs'
					? 'bg-gray-600 text-white'
					: 'text-gray-400 hover:bg-gray-800 hover:text-white'}"
				onclick={() => (bgVariant = 'orbs')}
			>
				Orbs
			</button>
			<button
				class="rounded px-3 py-1.5 text-left text-sm transition-colors {bgVariant === 'columns'
					? 'bg-gray-600 text-white'
					: 'text-gray-400 hover:bg-gray-800 hover:text-white'}"
				onclick={() => (bgVariant = 'columns')}
			>
				Columns
			</button>
			<button
				class="rounded px-3 py-1.5 text-left text-sm transition-colors {bgVariant === 'off'
					? 'bg-gray-600 text-white'
					: 'text-gray-400 hover:bg-gray-800 hover:text-white'}"
				onclick={() => (bgVariant = 'off')}
			>
				Off
			</button>
		</div>
		<span class="mt-3 magi-label-muted">Auto-scroll</span>
		<div class="mt-2 flex flex-col gap-1">
			<button
				class="rounded px-3 py-1.5 text-left text-sm transition-colors {scrollMode === 'snap'
					? 'bg-gray-600 text-white'
					: 'text-gray-400 hover:bg-gray-800 hover:text-white'}"
				onclick={() => (scrollMode = 'snap')}
			>
				Snap to top
			</button>
			<button
				class="rounded px-3 py-1.5 text-left text-sm transition-colors {scrollMode === 'follow'
					? 'bg-gray-600 text-white'
					: 'text-gray-400 hover:bg-gray-800 hover:text-white'}"
				onclick={() => (scrollMode = 'follow')}
			>
				Follow
			</button>
			<button
				class="rounded px-3 py-1.5 text-left text-sm transition-colors {scrollMode === 'off'
					? 'bg-gray-600 text-white'
					: 'text-gray-400 hover:bg-gray-800 hover:text-white'}"
				onclick={() => (scrollMode = 'off')}
			>
				Off
			</button>
		</div>
	</div>
{/snippet}

{#if openPanel === 'budget'}
	{@render panelShell('w-64', budgetBody)}
{/if}
{#snippet budgetBody()}
	<div class="rounded-lg border border-gray-700 bg-gray-900 p-3 shadow-xl">
		<div class="mb-3 flex items-center justify-between">
			<span class="flex items-center gap-1.5 magi-section-header magi-success">
				<Wallet size={13} /> BUDGET
			</span>
			<button
				type="button"
				class="text-gray-500 transition-colors hover:text-white"
				onclick={() => (openPanel = null)}
				aria-label="Close budget"
			>
				<X size={14} />
			</button>
		</div>
		<BudgetReadout active={openPanel === 'budget'} />
	</div>
{/snippet}

{#if openPanel === 'debug' && import.meta.env.DEV}
	{@render panelShell('w-80 max-w-full', debugBody)}
{/if}
{#snippet debugBody()}
	<DebugPanel
		scenario={debugScenario}
		{assignments}
		{genericLabels}
		disabled={loading}
		onchange={(next) => ondebugchange(next)}
		onclose={() => (openPanel = null)}
	/>
{/snippet}

{#if openPanel === 'stats'}
	{@render panelShell('w-96 max-w-full', statsBody)}
{/if}
{#snippet statsBody()}
	<StatsPanel nonce={statsNonce} {genericLabels} onclose={() => (openPanel = null)} />
{/snippet}
