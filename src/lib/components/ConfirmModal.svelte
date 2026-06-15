<script lang="ts">
	// A small, reusable confirmation dialog for destructive actions. The caller
	// owns visibility (mount it behind an `{#if}`) and supplies the copy plus the
	// confirm/cancel handlers.
	import { focusTrap } from '$lib/actions/focusTrap';

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
</script>

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
	<!-- Focus trap: lands on Cancel (the non-destructive action, so a reflexive
	     Enter cancels), keeps Tab inside the dialog, closes on Escape, and
	     restores focus on unmount. -->
	<div
		class="pointer-events-auto w-full max-w-sm magi-popover p-5"
		role="dialog"
		aria-modal="true"
		aria-labelledby="confirm-modal-title"
		use:focusTrap={{ onescape: oncancel }}
	>
		<h2 id="confirm-modal-title" class="text-sm font-semibold text-(--magi-text)">{title}</h2>
		<p class="mt-2 text-sm leading-relaxed text-(--magi-text-muted)">{message}</p>
		<div class="mt-5 flex justify-end gap-2">
			<button
				type="button"
				class="rounded-md px-3 py-1.5 text-sm text-(--magi-text-secondary) transition-colors hover:bg-(--magi-surface-hover)"
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
