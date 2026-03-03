<script lang="ts">
	/**
	 * Trending media section — replaces the Discover empty state.
	 * Shows trending movies & TV from TMDB with infinite scroll,
	 * genre filtering, media type toggle, and "NEW" badges.
	 */
	import PosterImage from '$lib/components/ui/PosterImage.svelte';
	import StarRating from '$lib/components/ui/StarRating.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import DownloadedCheck from '$lib/components/ui/DownloadedCheck.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import { tmdbDisplayTitle, tmdbYear, TMDB_GENRES, type TMDBSearchResult } from '$lib/types';
	import { onMount } from 'svelte';

	interface Props {
		onSelect: (item: TMDBSearchResult) => void;
		downloadedIds?: Set<number>;
		onCheckDownloadStatus?: (items: TMDBSearchResult[]) => void;
	}

	let { onSelect, downloadedIds = new Set(), onCheckDownloadStatus }: Props = $props();

	// ─── State ────────────────────────────────────────────────────────────────

	type MediaFilter = 'all' | 'movie' | 'tv';
	type TimeWindow = 'day' | 'week';

	let mediaFilter = $state<MediaFilter>('all');
	let timeWindow = $state<TimeWindow>('week');
	let selectedGenre = $state<number | null>(null);

	let allItems = $state<TMDBSearchResult[]>([]);
	let page = $state(1);
	let totalPages = $state(1);
	let loading = $state(true);
	let loadingMore = $state(false);
	let error = $state<string | null>(null);

	// Sentinel element for infinite scroll
	let sentinelEl = $state<HTMLDivElement | null>(null);
	let observer: IntersectionObserver | null = null;

	// ─── Derived ──────────────────────────────────────────────────────────────

	// 30-day threshold for "NEW" badge
	const NEW_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

	function isNew(item: TMDBSearchResult): boolean {
		const dateStr = item.release_date || item.first_air_date;
		if (!dateStr) return false;
		const releaseDate = new Date(dateStr);
		const now = new Date();
		const diff = now.getTime() - releaseDate.getTime();
		// Must be released (not future) and within 30 days
		return diff >= 0 && diff <= NEW_THRESHOLD_MS;
	}

	// Available genres derived from loaded items
	const availableGenres = $derived.by(() => {
		const genreCounts = new Map<number, number>();
		for (const item of allItems) {
			for (const gid of item.genre_ids) {
				if (TMDB_GENRES[gid]) {
					genreCounts.set(gid, (genreCounts.get(gid) || 0) + 1);
				}
			}
		}
		// Sort by frequency (most common first), then alphabetical
		return [...genreCounts.entries()]
			.sort((a, b) => b[1] - a[1] || TMDB_GENRES[a[0]].localeCompare(TMDB_GENRES[b[0]]))
			.map(([id]) => ({ id, name: TMDB_GENRES[id] }));
	});

	// Filtered items (genre is client-side)
	const filteredItems = $derived.by(() => {
		if (!selectedGenre) return allItems;
		return allItems.filter((item) => item.genre_ids.includes(selectedGenre!));
	});

	// ─── Data fetching ────────────────────────────────────────────────────────

	async function fetchTrending(pageNum: number, append: boolean = false) {
		if (append) {
			loadingMore = true;
		} else {
			loading = true;
			error = null;
		}

		try {
			const params = new URLSearchParams({
				type: mediaFilter,
				window: timeWindow,
				page: String(pageNum)
			});
			const res = await fetch(`/api/tmdb/trending?${params}`);
			if (!res.ok) throw new Error('Failed to fetch trending');
			const data = await res.json();

			if (append) {
				allItems = [...allItems, ...data.results];
			} else {
				allItems = data.results;
			}
			page = data.page;
			totalPages = data.totalPages;

			// Check library status for newly loaded items
			onCheckDownloadStatus?.(data.results);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load trending';
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	function loadNextPage() {
		if (loadingMore || page >= totalPages) return;
		fetchTrending(page + 1, true);
	}

	// Reset and refetch when mediaFilter or timeWindow changes
	$effect(() => {
		// Track these reactive deps
		const _mt = mediaFilter;
		const _tw = timeWindow;

		// Reset genre when media type changes since genre availability shifts
		selectedGenre = null;
		allItems = [];
		page = 1;
		totalPages = 1;
		fetchTrending(1);
	});

	// ─── Infinite scroll observer ─────────────────────────────────────────────

	$effect(() => {
		if (!sentinelEl) return;

		observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && !loading && !loadingMore && page < totalPages) {
					loadNextPage();
				}
			},
			{ rootMargin: '400px' }
		);

		observer.observe(sentinelEl);

		return () => {
			observer?.disconnect();
			observer = null;
		};
	});

	// Genre pill scroll container ref
	let genreScrollEl = $state<HTMLDivElement | null>(null);
</script>

<div class="flex flex-col gap-4">
	<!-- ── Header row ──────────────────────────────────────────────── -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2.5">
			<div
				class="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500/20 to-red-500/20 ring-1 ring-orange-500/20"
			>
				<svg class="h-3.5 w-3.5 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
					<path
						d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
					/>
					<path
						d="M17.66 11.2c-.23-.3-.51-.56-.77-.82-.67-.6-1.43-1.03-2.07-1.66C13.33 7.26 13 5.86 13.95 4c-1.73.46-2.96 1.77-3.44 3.3-.03.12-.07.25-.1.36-.16.67-.04 1.34.25 1.96.18.37.23.77.05 1.08-.26.47-.83.63-1.35.4-.2-.1-.36-.24-.5-.4-.02-.02-.04-.05-.06-.07C7.3 12.37 8.1 14.93 10 16.3c.08.06.17.1.25.16-.12-.1-.24-.22-.34-.33-.3-.33-.5-.73-.6-1.16-.1-.5.02-1.05.42-1.35.3-.22.7-.27 1.05-.15.25.08.48.24.65.45.55.65 1.36 1.04 2.17.95.63-.07 1.2-.42 1.6-.93.3-.38.45-.84.4-1.3-.05-.45-.3-.84-.7-1.1-.22-.14-.47-.2-.72-.26z"
					/>
				</svg>
			</div>
			<h3 class="text-sm font-semibold text-white">Trending</h3>
		</div>

		<!-- Time window toggle -->
		<div class="flex items-center rounded-full bg-neutral-800/80 p-0.5 ring-1 ring-white/[0.06]">
			<button
				type="button"
				onclick={() => (timeWindow = 'day')}
				class="rounded-full px-3 py-1 text-xs font-medium transition-all
					{timeWindow === 'day'
					? 'bg-white/10 text-white shadow-sm'
					: 'text-neutral-400 hover:text-neutral-300'}"
			>
				Today
			</button>
			<button
				type="button"
				onclick={() => (timeWindow = 'week')}
				class="rounded-full px-3 py-1 text-xs font-medium transition-all
					{timeWindow === 'week'
					? 'bg-white/10 text-white shadow-sm'
					: 'text-neutral-400 hover:text-neutral-300'}"
			>
				This Week
			</button>
		</div>
	</div>

	<!-- ── Media type + genre pills ───────────────────────────────── -->
	<div class="flex flex-col gap-2">
		<!-- Media type row -->
		<div class="flex gap-1.5">
			{#each [['all', 'All'], ['movie', 'Movies'], ['tv', 'TV Shows']] as [val, label]}
				<button
					type="button"
					onclick={() => (mediaFilter = val as MediaFilter)}
					class="rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all sm:px-4 sm:text-sm
						{mediaFilter === val
						? 'bg-white text-black'
						: 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'}"
				>
					{label}
				</button>
			{/each}
		</div>

		<!-- Genre pills (horizontally scrollable) -->
		{#if availableGenres.length > 0}
			<div
				bind:this={genreScrollEl}
				class="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:-mx-6 sm:px-6"
			>
				{#each availableGenres as genre (genre.id)}
					<button
						type="button"
						onclick={() => (selectedGenre = selectedGenre === genre.id ? null : genre.id)}
						class="rounded-full px-3 py-1 text-[11px] font-medium whitespace-nowrap transition-all
							{selectedGenre === genre.id
							? 'bg-blue-500/20 text-blue-400 ring-1 ring-blue-500/30'
							: 'bg-neutral-800/60 text-neutral-400 ring-1 ring-white/[0.04] hover:bg-neutral-800 hover:text-neutral-300'}"
					>
						{genre.name}
					</button>
				{/each}
			</div>
		{/if}
	</div>

	<!-- ── Grid ────────────────────────────────────────────────────── -->
	{#if loading}
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
			{#each Array(10) as _, i}
				<div class="animate-float-up" style="animation-delay: {i * 60}ms">
					<Skeleton class="aspect-[2/3] w-full" rounded="lg" />
					<Skeleton class="mt-2 h-3 w-3/4" rounded="sm" />
					<Skeleton class="mt-1.5 h-2 w-1/2" rounded="sm" />
				</div>
			{/each}
		</div>
	{:else if error}
		<div class="animate-fade-in flex flex-col items-center justify-center py-16 text-center">
			<div class="mb-3 rounded-full bg-red-900/20 p-3">
				<svg class="h-6 w-6 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
			</div>
			<p class="text-sm font-medium text-red-400">Couldn't load trending</p>
			<p class="mt-1 text-xs text-neutral-600">{error}</p>
			<button
				type="button"
				onclick={() => fetchTrending(1)}
				class="mt-3 text-xs text-blue-400 transition-colors hover:text-blue-300"
			>
				Try again
			</button>
		</div>
	{:else if filteredItems.length === 0 && selectedGenre}
		<div class="animate-fade-in py-12 text-center">
			<p class="text-sm text-neutral-500">No trending titles in {TMDB_GENRES[selectedGenre]}</p>
			<button
				type="button"
				onclick={() => (selectedGenre = null)}
				class="mt-2 text-xs text-blue-400 transition-colors hover:text-blue-300"
			>
				Clear filter
			</button>
		</div>
	{:else}
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
			{#each filteredItems as item, i (item.id)}
				{@const title = tmdbDisplayTitle(item)}
				{@const year = tmdbYear(item)}
				{@const itemIsNew = isNew(item)}
				{@const isDownloaded = downloadedIds.has(item.id)}

				<button
					type="button"
					onclick={() => onSelect(item)}
					class="group animate-float-up rounded-xl text-left focus:outline-none
						focus-visible:ring-2 focus-visible:ring-blue-500/50"
					style="animation-delay: {Math.min(i, 20) * 30}ms"
				>
					<!-- Poster -->
					<div
						class="card-hover relative overflow-hidden rounded-xl
						ring-1 ring-white/[0.06]"
					>
						<PosterImage path={item.poster_path} alt={title} size="w342" class="w-full" />

						<!-- Hover overlay -->
						<div
							class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent
							opacity-0 transition-opacity duration-300 group-hover:opacity-100"
						>
							<div class="absolute right-0 bottom-0 left-0 p-3">
								{#if item.overview}
									<p class="line-clamp-3 text-[11px] leading-relaxed text-neutral-200">
										{item.overview}
									</p>
								{/if}
							</div>
						</div>

						<!-- Top-left badges stack -->
						<div class="absolute top-2 left-2 flex flex-col gap-1">
							<Badge variant={item.media_type === 'movie' ? 'primary' : 'accent'} size="xs">
								{item.media_type === 'movie' ? 'Movie' : 'TV'}
							</Badge>
							{#if itemIsNew}
								<span
									class="inline-flex items-center rounded-full bg-lime-500/90 px-1.5 py-0.5
										text-[10px] leading-none font-bold tracking-wide text-black"
								>
									NEW
								</span>
							{/if}
						</div>

						<!-- Downloaded indicator -->
						{#if isDownloaded}
							<div class="absolute top-2 right-2">
								<DownloadedCheck size="sm" />
							</div>
						{/if}

						<!-- Rating pill -->
						{#if item.vote_average > 0}
							<div
								class="absolute right-2 bottom-2 rounded-full bg-black/60
								px-1.5 py-0.5 ring-1 ring-white/10 backdrop-blur-sm"
							>
								<StarRating score={item.vote_average} size="sm" />
							</div>
						{/if}
					</div>

					<!-- Text below poster -->
					<div class="mt-2 px-0.5">
						<h3
							class="truncate text-sm font-medium text-neutral-200
							transition-colors group-hover:text-white"
						>
							{title}
						</h3>
						<div class="mt-0.5 flex items-center gap-2">
							{#if year}
								<span class="text-xs text-neutral-500">{year}</span>
							{/if}
						</div>
					</div>
				</button>
			{/each}
		</div>

		<!-- Loading more indicator -->
		{#if loadingMore}
			<div class="flex items-center justify-center py-6">
				<svg class="h-5 w-5 animate-spin text-neutral-500" viewBox="0 0 24 24" fill="none">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
			</div>
		{/if}

		<!-- Infinite scroll sentinel -->
		{#if page < totalPages && !loading}
			<div bind:this={sentinelEl} class="h-4"></div>
		{/if}
	{/if}
</div>
