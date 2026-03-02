<script lang="ts">
	import type { SearchResult } from '$lib/types';
	import MediaCard from './MediaCard.svelte';

	interface Props {
		results: SearchResult[];
		total: number;
		onDownload?: (result: SearchResult) => void;
		downloadingIds?: Set<number>;
	}

	let { results = [], total = 0, onDownload, downloadingIds = new Set() }: Props = $props();

	const isEmpty = $derived(results.length === 0);

	// Stagger delay per item, capped at 15 items to avoid too long delays
	function getStaggerDelay(index: number): string {
		const delay = Math.min(index, 15) * 30;
		return `${delay}ms`;
	}
</script>

<div class="flex flex-col gap-4">
	{#if isEmpty}
		<div class="flex flex-col items-center justify-center py-16 text-center">
			<svg
				class="mb-4 h-16 w-16 text-neutral-700"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
			<p class="text-lg font-medium text-neutral-400">No results found</p>
			<p class="mt-1 text-sm text-neutral-500">Try a different search term</p>
		</div>
	{:else}
		<!-- Results header -->
		<div class="flex animate-fade-in items-center justify-between">
			<h2 class="text-lg font-semibold text-white">Results</h2>
			<span class="text-sm text-neutral-500"
				>{results.length}{total > results.length ? ` of ${total}` : ''} results</span
			>
		</div>

		<!-- Results list -->
		<div class="flex flex-col gap-1">
			{#each results as result, i (result.id)}
				<div class="animate-fade-in" style="animation-delay: {getStaggerDelay(i)}">
					<MediaCard {result} {onDownload} downloading={downloadingIds.has(result.id)} />
				</div>
			{/each}
		</div>
	{/if}
</div>
