<script lang="ts">
	/** Centred dialog shell used by the storage delete/cleanup modals */
	import { fade, scale } from 'svelte/transition';
	import type { Snippet } from 'svelte';

	interface Props {
		title: string;
		subtitle?: string;
		onClose: () => void;
		children: Snippet;
		footer: Snippet;
	}

	let { title, subtitle, onClose, children, footer }: Props = $props();

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
	onclick={(e) => e.target === e.currentTarget && onClose()}
	role="presentation"
	transition:fade={{ duration: 150 }}
>
	<div
		class="flex max-h-[90vh] w-full flex-col rounded-t-xl border border-neutral-800 bg-neutral-900 sm:max-w-lg sm:rounded-lg"
		role="dialog"
		aria-modal="true"
		aria-labelledby="storage-modal-title"
		transition:scale={{ duration: 150, start: 0.96 }}
	>
		<div class="flex items-start justify-between gap-3 border-b border-neutral-800 px-5 py-4">
			<div class="min-w-0">
				<h2 id="storage-modal-title" class="font-display text-2xl break-words text-white">
					{title}
				</h2>
				{#if subtitle}
					<p class="mt-0.5 text-xs break-words text-neutral-500">{subtitle}</p>
				{/if}
			</div>
			<button
				onclick={onClose}
				class="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-neutral-800 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
				aria-label="Close"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			</button>
		</div>

		<div class="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
			{@render children()}
		</div>

		<div class="flex justify-end gap-2 border-t border-neutral-800 px-5 py-3">
			{@render footer()}
		</div>
	</div>
</div>
