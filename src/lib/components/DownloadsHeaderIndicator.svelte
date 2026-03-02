<script lang="ts">
	import type { DownloadJob } from '$lib/types';

	interface Props {
		onClick: () => void;
		downloadingCount: number;
		fetchingJobs: DownloadJob[];
	}

	let { onClick, downloadingCount, fetchingJobs }: Props = $props();

	const isActive = $derived(downloadingCount > 0 || fetchingJobs.length > 0);
	const totalActive = $derived(downloadingCount + fetchingJobs.length);
</script>

{#if totalActive > 0 || downloadingCount >= 0}
	<button
		onclick={onClick}
		class="group relative flex items-center gap-2 rounded-full bg-neutral-800 pl-3 pr-3 py-1.5 transition-all hover:bg-neutral-750 min-w-[120px]"
		title="View downloads"
	>
		<!-- Content -->
		<div class="relative z-10 flex items-center gap-2 w-full">
			<!-- Download icon -->
			{#if isActive}
				<svg class="h-4 w-4 text-blue-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
				</svg>
			{:else}
				<svg class="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 24 24">
					<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
				</svg>
			{/if}

			<!-- Text -->
			<span class="text-xs font-medium text-white">
				{#if isActive}
					{totalActive} downloading
				{:else}
					Downloads
				{/if}
			</span>

			<!-- Chevron -->
			<svg class="h-3 w-3 text-neutral-400 group-hover:text-white transition-colors ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
			</svg>
		</div>
	</button>
{/if}
