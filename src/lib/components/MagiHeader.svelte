<script lang="ts">
	// The top bar plus its four header popovers (Debug, Stats, Budget, Settings).
	// Owns its own mutual-exclusion state (`openPanel`) because only one popover
	// is ever open at a time — that's a UI invariant the parent doesn't need to
	// know about.
	import type { Snippet } from 'svelte';
	import { Settings, Bug, BarChart3, Wallet, X, Menu, RotateCcw } from 'lucide-svelte';
	import BudgetReadout from './BudgetReadout.svelte';
	import StatsPanel from './StatsPanel.svelte';
	import DebugPanel, { type DebugScenario } from './DebugPanel.svelte';
	import StatesCatalog from './StatesCatalog.svelte';
	import ConfirmModal from './ConfirmModal.svelte';
	import { tooltip } from '$lib/actions/tooltip';
	import { clearPrefs, clearConversations } from '$lib/magi/persistence';
	import { clearRunStats } from '$lib/magi/run-stats';
	import type { NodeAssignment } from '$lib/magi/config';
	import {
		PALETTES,
		PALETTE_LABELS,
		MOTION_MODES,
		MOTION_MODE_LABELS,
		type BgVariant,
		type ScrollMode,
		type Palette,
		type MotionMode
	} from '$lib/magi/types';

	type HeaderPanel = 'debug' | 'catalog' | 'stats' | 'budget' | 'settings' | 'menu';

	interface Props {
		theme: 'dark' | 'light';
		bgVariant: BgVariant;
		palette: Palette;
		scrollMode: ScrollMode;
		genericLabels: boolean;
		motionMode: MotionMode;
		assignments: [NodeAssignment, NodeAssignment, NodeAssignment];
		loading: boolean;
		debugScenario: DebugScenario;
		statsNonce: number;
		/** Fires when the user picks a new debug scenario from the Debug panel —
		 *  the parent owns the side effect of injecting it into live state. */
		ondebugchange: (next: DebugScenario) => void;
		/** Replay the intro splash — the title mark is the trigger (the repo lives
		 *  in the footer now). The parent owns which concept plays. */
		onreplaysplash?: () => void;
	}

	let {
		theme = $bindable(),
		bgVariant = $bindable(),
		palette = $bindable(),
		scrollMode = $bindable(),
		genericLabels = $bindable(),
		motionMode = $bindable(),
		assignments,
		loading,
		debugScenario,
		statsNonce,
		ondebugchange,
		onreplaysplash
	}: Props = $props();

	let openPanel = $state<HeaderPanel | null>(null);
	const togglePanel = (panel: HeaderPanel) => (openPanel = openPanel === panel ? null : panel);

	// Escape closes an open header popover, matching StrategyPicker and the modals.
	// If a modal dialog is open on top (reset confirm, temperament editor), defer to
	// it and leave the panel underneath alone — its own Escape handler runs first.
	function onWindowKeydown(e: KeyboardEvent) {
		if (e.key !== 'Escape' || openPanel === null) return;
		if (document.querySelector('[role="dialog"]')) return;
		openPanel = null;
	}

	let showResetConfirm = $state(false);

	// Wipe every persisted slice — global settings + per-tier model snapshots
	// (prefs), conversation history, and run stats — then reload so in-memory
	// state is rebuilt from the now-empty storage, restoring in-code defaults.
	function resetToDefaults() {
		clearPrefs();
		clearConversations();
		clearRunStats();
		location.reload();
	}
</script>

<svelte:window onkeydown={onWindowKeydown} />

<header class="magi-header relative z-30 shrink-0 border-b border-gray-800 bg-gray-950">
	<div class="relative mx-auto max-w-[88rem] px-4 py-4 md:px-6">
		<h1 class="magi-headline text-center">
			<button
				type="button"
				class="inline-block cursor-pointer transition-opacity hover:opacity-80"
				onclick={() => onreplaysplash?.()}
				use:tooltip={{ text: 'Replay the MAGI intro', touch: false }}
				aria-label="MAGI — replay the intro animation"
			>
				MAGI <span class="text-base" aria-hidden="true"
					><span class="text-(--magi-node-red)">▲</span><span class="text-(--magi-node-green)"
						>▼</span
					><span class="text-(--magi-node-blue)">▲</span></span
				>
			</button>
		</h1>
		<div class="absolute top-1/2 right-4 -translate-y-1/2 md:right-6">
			<!-- Mobile: single hamburger that opens a menu listing every section -->
			<button
				type="button"
				class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white sm:hidden"
				onclick={() => togglePanel('menu')}
				use:tooltip={{ text: 'Menu', touch: false }}
				aria-label="Open menu"
				aria-expanded={openPanel === 'menu'}
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
						use:tooltip={{ text: 'Debug panel (dev only)', touch: false }}
						aria-label="Debug panel"
						aria-expanded={openPanel === 'debug'}
					>
						<Bug size={16} />
					</button>
				{/if}
				<button
					type="button"
					class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-800 hover:text-green-400"
					onclick={() => togglePanel('stats')}
					use:tooltip={{ text: 'Stats', touch: false }}
					aria-label="Stats"
					aria-expanded={openPanel === 'stats'}
				>
					<BarChart3 size={16} />
				</button>
				<button
					type="button"
					class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-800 hover:text-green-400"
					onclick={() => togglePanel('budget')}
					use:tooltip={{ text: 'Budget', touch: false }}
					aria-label="Budget"
					aria-expanded={openPanel === 'budget'}
				>
					<Wallet size={16} />
				</button>
				<button
					type="button"
					class="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-800 hover:text-white"
					onclick={() => togglePanel('settings')}
					use:tooltip={{ text: 'Settings', touch: false }}
					aria-label="Settings"
					aria-expanded={openPanel === 'settings'}
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
	<div
		class="pointer-events-none fixed top-14 right-0 left-0 z-50 mx-auto max-w-[88rem] px-4 md:px-6"
	>
		<!-- Cap the panel to the space below the header and let it scroll, so a tall
		     panel (Settings, Stats) can always reach its bottom on a short screen. -->
		<div class="pointer-events-auto ml-auto {width} max-h-[calc(100dvh-4.5rem)] overflow-y-auto">
			{@render body()}
		</div>
	</div>
{/snippet}

{#if openPanel === 'menu'}
	{@render panelShell('w-56', menuBody)}
{/if}
{#snippet menuBody()}
	<div class="magi-popover p-3">
		<div class="mb-3 flex items-center justify-between">
			<span class="magi-section-header text-gray-400">MENU</span>
			<button
				type="button"
				class="text-gray-500 transition-colors hover:text-(--magi-text)"
				onclick={() => (openPanel = null)}
				aria-label="Close menu"
			>
				<X size={14} />
			</button>
		</div>
		<div class="flex flex-col gap-1">
			{#if import.meta.env.DEV}
				<button
					type="button"
					class="flex items-center gap-2 rounded px-3 py-1.5 text-left text-sm text-(--magi-text-secondary) transition-colors hover:bg-gray-800 hover:text-amber-400"
					onclick={() => (openPanel = 'debug')}
				>
					<Bug size={14} /> Debug
				</button>
			{/if}
			<button
				type="button"
				class="flex items-center gap-2 rounded px-3 py-1.5 text-left text-sm text-(--magi-text-secondary) transition-colors hover:bg-gray-800 hover:text-green-400"
				onclick={() => (openPanel = 'stats')}
			>
				<BarChart3 size={14} /> Stats
			</button>
			<button
				type="button"
				class="flex items-center gap-2 rounded px-3 py-1.5 text-left text-sm text-(--magi-text-secondary) transition-colors hover:bg-gray-800 hover:text-green-400"
				onclick={() => (openPanel = 'budget')}
			>
				<Wallet size={14} /> Budget
			</button>
			<button
				type="button"
				class="flex items-center gap-2 rounded px-3 py-1.5 text-left text-sm text-(--magi-text-secondary) transition-colors hover:bg-gray-800 hover:text-white"
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
	<div class="magi-popover p-3">
		<div class="mb-3 flex items-center justify-between">
			<span class="flex items-center gap-1.5 magi-section-header text-gray-400">
				<Settings size={13} /> SETTINGS
			</span>
			<button
				type="button"
				class="text-gray-500 transition-colors hover:text-(--magi-text)"
				onclick={() => (openPanel = null)}
				aria-label="Close settings"
			>
				<X size={14} />
			</button>
		</div>
		<span class="magi-section-header text-gray-500">THEME</span>
		<div class="mt-2 flex flex-col gap-1">
			<button
				class="rounded px-3 py-1.5 text-left text-sm transition-colors {theme === 'dark'
					? 'bg-gray-600 text-white'
					: 'text-(--magi-text-muted) hover:bg-gray-800 hover:text-gray-200'}"
				aria-pressed={theme === 'dark'}
				onclick={() => (theme = 'dark')}
			>
				Dark
			</button>
			<button
				class="rounded px-3 py-1.5 text-left text-sm transition-colors {theme === 'light'
					? 'bg-gray-600 text-white'
					: 'text-(--magi-text-muted) hover:bg-gray-800 hover:text-gray-200'}"
				aria-pressed={theme === 'light'}
				onclick={() => (theme = 'light')}
			>
				Light
			</button>
		</div>
		<span class="mt-3 magi-section-header text-gray-500">PALETTE</span>
		<div class="mt-2 flex flex-col gap-1">
			{#each PALETTES as p (p)}
				<button
					class="rounded px-3 py-1.5 text-left text-sm transition-colors {palette === p
						? 'bg-gray-600 text-white'
						: 'text-(--magi-text-muted) hover:bg-gray-800 hover:text-gray-200'}"
					aria-pressed={palette === p}
					onclick={() => (palette = p)}
				>
					{PALETTE_LABELS[p]}
				</button>
			{/each}
		</div>
		<span class="mt-3 magi-section-header text-gray-500">BACKGROUND</span>
		<div class="mt-2 flex flex-col gap-1">
			<button
				class="rounded px-3 py-1.5 text-left text-sm transition-colors {bgVariant === 'off'
					? 'bg-gray-600 text-white'
					: 'text-(--magi-text-muted) hover:bg-gray-800 hover:text-gray-200'}"
				aria-pressed={bgVariant === 'off'}
				onclick={() => (bgVariant = 'off')}
			>
				Off
			</button>
			<button
				class="rounded px-3 py-1.5 text-left text-sm transition-colors {bgVariant === 'hex'
					? 'bg-gray-600 text-white'
					: 'text-(--magi-text-muted) hover:bg-gray-800 hover:text-gray-200'}"
				aria-pressed={bgVariant === 'hex'}
				onclick={() => (bgVariant = 'hex')}
			>
				Hex
			</button>
			<button
				class="rounded px-3 py-1.5 text-left text-sm transition-colors {bgVariant === 'orbs'
					? 'bg-gray-600 text-white'
					: 'text-(--magi-text-muted) hover:bg-gray-800 hover:text-gray-200'}"
				aria-pressed={bgVariant === 'orbs'}
				onclick={() => (bgVariant = 'orbs')}
			>
				Orbs
			</button>
			<button
				class="rounded px-3 py-1.5 text-left text-sm transition-colors {bgVariant === 'columns'
					? 'bg-gray-600 text-white'
					: 'text-(--magi-text-muted) hover:bg-gray-800 hover:text-gray-200'}"
				aria-pressed={bgVariant === 'columns'}
				onclick={() => (bgVariant = 'columns')}
			>
				Columns
			</button>
		</div>
		<span class="mt-3 magi-section-header text-gray-500">MOTION</span>
		<div class="mt-2 flex flex-col gap-1">
			{#each MOTION_MODES as mode (mode)}
				<button
					class="rounded px-3 py-1.5 text-left text-sm transition-colors {motionMode === mode
						? 'bg-gray-600 text-white'
						: 'text-(--magi-text-muted) hover:bg-gray-800 hover:text-gray-200'}"
					aria-pressed={motionMode === mode}
					onclick={() => (motionMode = mode)}
				>
					{MOTION_MODE_LABELS[mode]}
				</button>
			{/each}
		</div>
		<span class="mt-3 magi-section-header text-gray-500">AUTO-SCROLL</span>
		<div class="mt-2 flex flex-col gap-1">
			<button
				class="rounded px-3 py-1.5 text-left text-sm transition-colors {scrollMode === 'follow'
					? 'bg-gray-600 text-white'
					: 'text-(--magi-text-muted) hover:bg-gray-800 hover:text-gray-200'}"
				aria-pressed={scrollMode === 'follow'}
				onclick={() => (scrollMode = 'follow')}
			>
				Follow
			</button>
			<button
				class="rounded px-3 py-1.5 text-left text-sm transition-colors {scrollMode === 'snap'
					? 'bg-gray-600 text-white'
					: 'text-(--magi-text-muted) hover:bg-gray-800 hover:text-gray-200'}"
				aria-pressed={scrollMode === 'snap'}
				onclick={() => (scrollMode = 'snap')}
			>
				Snap
			</button>
			<button
				class="rounded px-3 py-1.5 text-left text-sm transition-colors {scrollMode === 'off'
					? 'bg-gray-600 text-white'
					: 'text-(--magi-text-muted) hover:bg-gray-800 hover:text-gray-200'}"
				aria-pressed={scrollMode === 'off'}
				onclick={() => (scrollMode = 'off')}
			>
				Off
			</button>
		</div>
		<div class="mt-3 border-t border-gray-800 pt-3">
			<button
				type="button"
				class="flex w-full items-center gap-2 rounded px-3 py-1.5 text-left text-sm text-red-400 transition-colors hover:bg-red-950/40 hover:text-red-300"
				onclick={() => {
					openPanel = null;
					showResetConfirm = true;
				}}
			>
				<RotateCcw size={13} /> Reset to defaults
			</button>
		</div>
	</div>
{/snippet}

{#if openPanel === 'budget'}
	{@render panelShell('w-64', budgetBody)}
{/if}
{#snippet budgetBody()}
	<div class="magi-popover p-3">
		<div class="mb-3 flex items-center justify-between">
			<span class="flex items-center gap-1.5 magi-section-header magi-success">
				<Wallet size={13} /> BUDGET
			</span>
			<button
				type="button"
				class="text-gray-500 transition-colors hover:text-(--magi-text)"
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
		onopencatalog={() => (openPanel = 'catalog')}
	/>
{/snippet}

{#if openPanel === 'catalog' && import.meta.env.DEV}
	{@render panelShell('w-[44rem] max-w-full', catalogBody)}
{/if}
{#snippet catalogBody()}
	<StatesCatalog {genericLabels} onclose={() => (openPanel = null)} />
{/snippet}

{#if openPanel === 'stats'}
	<!-- Wide enough to keep the strategy filter (incl. "Structured Voting" +
	     "Multi-Round Debate") on a single line; max-w-full reins it in on mobile. -->
	{@render panelShell('w-[30rem] max-w-full', statsBody)}
{/if}
{#snippet statsBody()}
	<StatsPanel nonce={statsNonce} {genericLabels} onclose={() => (openPanel = null)} />
{/snippet}

{#if showResetConfirm}
	<ConfirmModal
		title="Reset everything?"
		message="This clears all saved settings, per-tier model selections, conversation history, and run stats, then reloads. This can't be undone."
		confirmLabel="Reset"
		onconfirm={resetToDefaults}
		oncancel={() => (showResetConfirm = false)}
	/>
{/if}
