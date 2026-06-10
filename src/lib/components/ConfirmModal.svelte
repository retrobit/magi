<script lang="ts">
	// A small, reusable confirmation dialog for destructive actions. The caller
	// owns visibility (mount it behind an `{#if}`) and supplies the copy plus the
	// confirm/cancel handlers.
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

	// Default focus to the non-destructive action, so a reflexive Enter or Space
	// cancels rather than triggering the destructive confirm.
	$effect(() => {
		cancelButton?.focus();
	});

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') oncancel();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<!-- Backdrop is a real <button> (matching the header popover scaffold) so the
     click-to-dismiss affordance is keyboard-accessible without extra ARIA. -->
<button
	class="fixed inset-0 z-50 cursor-default bg-black/60 backdrop-blur-sm"
	onclick={oncancel}
	aria-label={cancelLabel}
></button>
<div class="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
	<div
		class="pointer-events-auto w-full max-w-sm magi-popover p-5"
		role="dialog"
		aria-modal="true"
		aria-labelledby="confirm-modal-title"
	>
		<h2 id="confirm-modal-title" class="text-sm font-semibold text-(--magi-text)">{title}</h2>
		<p class="mt-2 text-sm leading-relaxed text-gray-400">{message}</p>
		<div class="mt-5 flex justify-end gap-2">
			<button
				bind:this={cancelButton}
				type="button"
				class="rounded-md px-3 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
				onclick={oncancel}
			>
				{cancelLabel}
			</button>
			<button
				type="button"
				class="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-500"
				onclick={onconfirm}
			>
				{confirmLabel}
			</button>
		</div>
	</div>
</div>
