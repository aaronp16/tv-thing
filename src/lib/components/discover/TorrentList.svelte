<script lang="ts">
	/**
	 * Torrent list for the Discover detail pages.
	 * Shows TorrentLeech search results in a compact list format
	 * with download buttons that use the existing download flow.
	 */
	import Badge from '$lib/components/ui/Badge.svelte';
	import type { SearchResult, SearchCategory } from '$lib/types';

	interface Props {
		query: string;
		category: SearchCategory;
		imdbId?: string;
		onDownload: (result: SearchResult) => void;
		downloadingIds: Set<number>;
		class?: string;
	}

	let {
		query,
		category,
		imdbId,
		onDownload,
		downloadingIds,
		class: className = ''
	}: Props = $props();

	let results: SearchResult[] = $state([]);
	let loading = $state(false);
	let error = $state<string | null>(null);
	let hasSearched = $state(false);
	let useImdb = $state(false);

	/** Extract quality tags from torrent name */
	function extractTags(name: string): string[] {
		const patterns = [
			/\b(2160p|4K|UHD)\b/i,
			/\b(1080p)\b/i,
			/\b(720p)\b/i,
			/\b(480p)\b/i,
			/\b(WEB-?DL|WEBRip|HDTV|BluRay|BDRip|BRRip|DVDRip|DVD-?R|PDTV|HDRip)\b/i,
			/\b(x264|x265|H\.?264|H\.?265|HEVC|AV1)\b/i,
			/\b(DTS|DTS-HD|Atmos|TrueHD|DD5\.1|AAC|FLAC|AC3)\b/i,
			/\b(REMUX)\b/i
		];
		const tags: string[] = [];
		for (const pattern of patterns) {
			const match = name.match(pattern);
			if (match) tags.push(match[1]);
		}
		return tags;
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
	}

	async function search() {
		loading = true;
		error = null;
		hasSearched = true;

		try {
			const params = new URLSearchParams({
				category,
				sort: 'seeders',
				order: 'desc'
			});

			if (useImdb && imdbId) {
				params.set('imdbId', imdbId);
			} else {
				params.set('q', query);
			}

			const res = await fetch(`/api/search?${params}`);
			if (!res.ok) throw new Error('Search failed');
			const data = await res.json();
			results = data.results || [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Search failed';
			results = [];
		} finally {
			loading = false;
		}
	}

	// Auto-search when component mounts or query/category/imdb mode changes
	$effect(() => {
		// Read all dependencies for tracking
		const _q = query;
		const _c = category;
		const _useImdb = useImdb;
		const _imdbId = imdbId;
		if (_q || (_useImdb && _imdbId)) {
			search();
		}
	});

	function toggleImdb() {
		useImdb = !useImdb;
		// The $effect will fire from useImdb changing, triggering search automatically
	}
</script>

<div class={className}>
	<!-- Header with IMDB toggle -->
	{#if imdbId}
		<div class="mb-3 flex items-center justify-between">
			<div class="flex items-center gap-2">
				{#if loading}
					<div
						class="h-4 w-4 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400"
					></div>
				{/if}
				{#if hasSearched && !loading}
					<span class="text-xs text-neutral-500">
						{results.length} torrent{results.length !== 1 ? 's' : ''}
					</span>
				{/if}
			</div>
			<button
				type="button"
				onclick={toggleImdb}
				class="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium
					transition-all duration-200
					{useImdb
					? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25'
					: 'bg-white/[0.04] text-neutral-500 ring-1 ring-white/[0.06] hover:bg-white/[0.06] hover:text-neutral-300'}"
			>
				<svg class="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
					<path
						d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 1.5L18.5 9H13V3.5zM6 20V4h5v7h7v9H6z"
					/>
				</svg>
				IMDB
			</button>
		</div>
	{/if}

	<!-- Results -->
	{#if loading && !hasSearched}
		<div class="space-y-2">
			{#each Array(5) as _, i}
				<div class="shimmer h-16 rounded-lg" style="animation-delay: {i * 100}ms"></div>
			{/each}
		</div>
	{:else if error}
		<div class="py-6 text-center">
			<p class="text-sm text-red-400">{error}</p>
			<button
				type="button"
				onclick={search}
				class="mt-2 text-xs text-blue-400 transition-colors hover:text-blue-300"
			>
				Try again
			</button>
		</div>
	{:else if results.length === 0 && hasSearched && !loading}
		<div class="py-8 text-center">
			<svg
				class="mx-auto mb-3 h-10 w-10 text-neutral-600"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
				/>
			</svg>
			<p class="text-sm text-neutral-500">No torrents found</p>
			{#if imdbId && !useImdb}
				<button
					type="button"
					onclick={toggleImdb}
					class="mt-2 text-xs text-blue-400 transition-colors hover:text-blue-300"
				>
					Try searching by IMDB ID
				</button>
			{/if}
		</div>
	{:else}
		<div class="space-y-0.5">
			{#each results as result, i}
				{@const tags = extractTags(result.name)}
				{@const isDownloading = downloadingIds.has(result.id)}
				<button
					type="button"
					onclick={() => onDownload(result)}
					disabled={isDownloading}
					class="group animate-float-up flex w-full items-center gap-3 rounded-lg px-3 py-2.5
						text-left transition-all duration-200
						{isDownloading
						? 'cursor-not-allowed bg-neutral-800/30 opacity-60'
						: 'cursor-pointer hover:bg-white/[0.04] active:bg-white/[0.06]'}"
					style="animation-delay: {i * 30}ms"
				>
					<div class="min-w-0 flex-1">
						<!-- Title -->
						<p
							class="truncate text-sm leading-tight text-neutral-200 transition-colors group-hover:text-white"
						>
							{result.title}
						</p>

						<!-- Tags + stats -->
						<div class="mt-1 flex flex-wrap items-center gap-1.5">
							{#if result.freeleech}
								<Badge variant="success" size="xs">FL</Badge>
							{/if}
							{#each tags as tag}
								<span
									class="rounded bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-medium
									text-neutral-400 ring-1 ring-white/[0.04]">{tag}</span
								>
							{/each}
							<span class="ml-1 text-[11px] text-neutral-500">{formatBytes(result.size)}</span>
							<span class="ml-1 flex items-center gap-1 text-[11px]">
								<span
									class="h-1.5 w-1.5 rounded-full {result.seeders > 0
										? 'bg-emerald-500'
										: 'bg-red-500'}"
								></span>
								<span class={result.seeders > 0 ? 'text-emerald-400/80' : 'text-red-400/80'}
									>{result.seeders}</span
								>
								<span class="text-neutral-600">/ {result.leechers}</span>
							</span>
						</div>
					</div>

					<!-- Download button -->
					<div class="flex-shrink-0">
						{#if isDownloading}
							<div
								class="h-5 w-5 animate-spin rounded-full border-2 border-blue-400/30 border-t-blue-400"
							></div>
						{:else}
							<svg
								class="h-5 w-5 text-neutral-600 transition-colors group-hover:text-blue-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
								/>
							</svg>
						{/if}
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>
