<script lang="ts">
	import { toasts } from '$lib/stores/toasts';
	import { fly, fade } from 'svelte/transition';

	const iconPaths: Record<string, string> = {
		success: 'M5 13l4 4L19 7',
		error: 'M6 18L18 6M6 6l12 12',
		warning:
			'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
		info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
	};

	const bgColors: Record<string, string> = {
		success: 'bg-green-600',
		error: 'bg-red-600',
		warning: 'bg-yellow-600',
		info: 'bg-blue-600'
	};

	function handleDismiss(id: string) {
		toasts.remove(id);
	}
</script>

<div
	class="pointer-events-none fixed bottom-20 left-4 right-4 z-50 flex flex-col gap-2 md:bottom-4 md:left-auto md:right-4"
>
	{#each $toasts as toast (toast.id)}
		<div
			class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg {bgColors[
				toast.type
			]} p-4 text-white shadow-lg md:w-80 md:max-w-none"
			in:fly={{ x: 100, duration: 200 }}
			out:fade={{ duration: 150 }}
			role="alert"
		>
			<!-- Icon -->
			<svg class="h-5 w-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d={iconPaths[toast.type]}
				/>
			</svg>

			<!-- Message -->
			<p class="flex-1 text-sm">{toast.message}</p>

			<!-- Dismiss button -->
			<button
				onclick={() => handleDismiss(toast.id)}
				class="flex-shrink-0 rounded p-0.5 opacity-70 transition-opacity hover:opacity-100"
				aria-label="Dismiss"
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
	{/each}
</div>
