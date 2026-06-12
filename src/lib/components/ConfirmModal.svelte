<script lang="ts">
	// A small, reusable confirmation dialog for destructive actions. The caller
	// owns visibility (mount it behind an `{#if}`) and supplies the copy plus the
	// confirm/cancel handlers.
	import { onMount, onDestroy } from 'svelte';

	interface Props {
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		onconfirm: () => void;
		oncancel: () => void;
	}

	let {
		title,
		message,
		confirmLabel = 'Confirm',
		cancelLabel = 'Cancel',
		onconfirm,
		oncancel
	}: Props = $props();

	let cancelButton = $state<HTMLButtonElement | null>(null);
	let confirmButton = $state<HTMLButtonElement | null>(null);

	// Capture the element that was focused before the modal opened so we can
	// restore it when the modal unmounts.
	let previousFocus: Element | null = null;

	onMount(() => {
		previousFocus = document.activeElement;
	});

	onDestroy(() => {
		// Restore focus to whatever had it before the modal opened, as long as
		// that element is still in the document.
		if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
			previousFocus.focus();
		}
	});

	// Default focus to the non-destructive action, so a reflexive Enter or Space
	// cancels rather than triggering the destructive confirm.
	$effect(() => {
		cancelButton?.focus();
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			oncancel();
			return;
		}
		// Trap Tab: cycle only between Cancel and Confirm; the backdrop button is
		// excluded from the tab cycle (it gets tabindex="-1") but stays clickable.
		if (e.key === 'Tab') {
			const focusable = [cancelButton, confirmButton].filter(Boolean) as HTMLButtonElement[];
			if (focusable.length < 2) return;
			e.preventDefault();
			const active = document.activeElement;
			if (e.shiftKey) {
				// Shift+Tab: move backward; wrap from Cancel → Confirm.
				const next = active === focusable[0] ? focusable[focusable.length - 1] : focusable[0];
				next.focus();
			} else {
				// Tab: move forward; wrap from Confirm → Cancel.
				const next =
					active === focusable[focusable.length - 1]
						? focusable[0]
						: focusable[focusable.length - 1];
				next.focus();
			}
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Backdrop is a real <button> (matching the header popover scaffold) so the
     click-to-dismiss affordance is keyboard-accessible without extra ARIA.
     tabindex="-1" excludes it from the Tab cycle while keeping it clickable. -->
<button
	class="fixed inset-0 z-50 cursor-default bg-black/60 backdrop-blur-sm"
	onclick={oncancel}
	aria-label={cancelLabel}
	tabindex="-1"
></button>
<div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
	<div
		class="pointer-events-auto w-full max-w-sm magi-popover p-5"
		role="dialog"
		aria-modal="true"
		aria-labelledby="confirm-modal-title"
	>
		<h2 id="confirm-modal-title" class="text-sm font-semibold text-(--magi-text)">{title}</h2>
		<p class="mt-2 text-sm leading-relaxed text-(--magi-text-muted)">{message}</p>
		<div class="mt-5 flex justify-end gap-2">
			<button
				bind:this={cancelButton}
				type="button"
				class="rounded-md px-3 py-1.5 text-sm text-(--magi-text-secondary) transition-colors hover:bg-(--magi-surface-hover)"
				onclick={oncancel}
			>
				{cancelLabel}
			</button>
			<button
				bind:this={confirmButton}
				type="button"
				class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
				onclick={onconfirm}
			>
				{confirmLabel}
			</button>
		</div>
	</div>
</div>
