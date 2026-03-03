<script lang="ts">
	/**
	 * Main Discover view container.
	 * Handles search, results display, and navigation to detail pages.
	 * This is the top-level component that gets swapped in when the Discover tab is active.
	 */
	import DiscoverSearchResults from '$lib/components/discover/DiscoverSearchResults.svelte';
	import MediaDetailPage from '$lib/components/discover/MediaDetailPage.svelte';
	import { tmdbDisplayTitle, tmdbYear, type TMDBSearchResult, type SearchResult } from '$lib/types';

	interface Props {
		onDownload: (result: SearchResult) => void;
		downloadingIds: Set<number>;
		pendingOpen?: { tmdbId: number; mediaType: 'movie' | 'tv' } | null;
		onPendingOpenConsumed?: () => void;
	}

	let { onDownload, downloadingIds, pendingOpen = null, onPendingOpenConsumed }: Props = $props();

	// Navigation state
	let view = $state<'search' | 'detail'>('search');
	let selectedItem = $state<TMDBSearchResult | null>(null);

	// Search state
	let searchQuery = $state('');
	let searchResults = $state<TMDBSearchResult[]>([]);
	let loading = $state(false);
	let hasSearched = $state(false);
	let totalResults = $state(0);
	let downloadedIds = $state<Set<number>>(new Set());

	// Search input ref
	let searchInput = $state<HTMLInputElement | null>(null);

	// Debounce timer
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	async function performSearch(query: string) {
		if (!query.trim()) {
			searchResults = [];
			hasSearched = false;
			totalResults = 0;
			return;
		}

		loading = true;
		hasSearched = true;

		try {
			const res = await fetch(`/api/tmdb/search?q=${encodeURIComponent(query.trim())}`);
			if (!res.ok) throw new Error('Search failed');
			const data = await res.json();
			searchResults = data.results || [];
			totalResults = data.total || 0;

			// Check download status for all results
			checkDownloadStatus(searchResults);
		} catch {
			searchResults = [];
		} finally {
			loading = false;
		}
	}

	async function checkDownloadStatus(items: TMDBSearchResult[]) {
		const newDownloaded = new Set<number>();

		// Check in parallel (batch of 5)
		const checks = items.map(async (item) => {
			try {
				const title = tmdbDisplayTitle(item);
				const year = tmdbYear(item);
				const mediaType = item.media_type;
				const params = new URLSearchParams({ title, mediaType });
				if (year) params.set('year', year);

				const res = await fetch(`/api/library/check?${params}`);
				if (res.ok) {
					const data = await res.json();
					if (data.downloaded) newDownloaded.add(item.id);
				}
			} catch {
				// Silently fail individual checks
			}
		});

		await Promise.all(checks);
		downloadedIds = newDownloaded;
	}

	function handleSearchInput(e: Event) {
		const value = (e.target as HTMLInputElement).value;
		searchQuery = value;

		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			performSearch(value);
		}, 400);
	}

	function handleSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			if (debounceTimer) clearTimeout(debounceTimer);
			performSearch(searchQuery);
		}
		if (e.key === 'Escape') {
			searchQuery = '';
			searchResults = [];
			hasSearched = false;
		}
	}

	function clearSearch() {
		searchQuery = '';
		searchResults = [];
		hasSearched = false;
		totalResults = 0;
		searchInput?.focus();
	}

	function selectItem(item: TMDBSearchResult) {
		selectedItem = item;
		view = 'detail';
	}

	function goBack() {
		view = 'search';
		selectedItem = null;
	}

	// Open detail page by TMDB ID (triggered from LibraryPanel)
	$effect(() => {
		if (!pendingOpen) return;
		const { tmdbId, mediaType } = pendingOpen;
		onPendingOpenConsumed?.();

		fetch(`/api/tmdb/${mediaType}/${tmdbId}`)
			.then((r) => r.json())
			.then((data) => {
				if (!data || data.error) return;
				// Construct a minimal TMDBSearchResult-compatible object
				const item: TMDBSearchResult = {
					id: data.id,
					media_type: mediaType,
					title: data.title,
					name: data.name,
					original_title: data.original_title,
					original_name: data.original_name,
					overview: data.overview ?? '',
					poster_path: data.poster_path ?? null,
					backdrop_path: data.backdrop_path ?? null,
					vote_average: data.vote_average ?? 0,
					vote_count: data.vote_count ?? 0,
					release_date: data.release_date,
					first_air_date: data.first_air_date,
					genre_ids: (data.genres ?? []).map((g: { id: number }) => g.id),
					popularity: data.popularity ?? 0
				};
				selectItem(item);
			})
			.catch(() => {
				// silently ignore
			});
	});
</script>

<div class="relative flex h-full flex-col overflow-hidden">
	<!-- Back button — absolute overlay on the detail view, always visible -->
	{#if view === 'detail'}
		<button
			type="button"
			onclick={goBack}
			class="absolute top-4 left-4 z-30 inline-flex items-center gap-2 rounded-full
				bg-black/60 px-3 py-1.5 text-sm text-neutral-300
				ring-1 ring-white/10 backdrop-blur-md transition-all
				duration-200 hover:bg-black/75 hover:text-white hover:ring-white/20"
		>
			<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
			Back
		</button>
	{/if}

	{#if view === 'search'}
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- SEARCH VIEW                                                        -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<div class="animate-fade-in flex h-full flex-col">
			<!-- Search header -->
			<div class="flex-shrink-0 px-4 pt-3 pb-4 sm:px-6">
				<!-- Search bar -->
				<div class="relative">
					<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
						{#if loading}
							<svg class="h-5 w-5 animate-spin text-neutral-400" viewBox="0 0 24 24" fill="none">
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path>
							</svg>
						{:else}
							<svg
								class="h-5 w-5 text-neutral-400"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
								/>
							</svg>
						{/if}
					</div>

					<input
						bind:this={searchInput}
						type="text"
						value={searchQuery}
						oninput={handleSearchInput}
						onkeydown={handleSearchKeydown}
						placeholder="Search movies & TV shows..."
						class="w-full rounded-full border-0 bg-neutral-800 py-3 pl-12 text-white placeholder-neutral-500 ring-1 ring-neutral-700 transition-all focus:bg-neutral-750 focus:ring-2 focus:ring-blue-500 focus:outline-none {searchQuery
							? 'pr-10'
							: 'pr-4'}"
					/>

					<!-- Clear button -->
					{#if searchQuery}
						<button
							type="button"
							onclick={clearSearch}
							aria-label="Clear search"
							class="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 transition-colors hover:text-white"
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
					{/if}
				</div>

				<!-- Result count -->
				{#if hasSearched && !loading && searchResults.length > 0}
					<div class="animate-slide-down-fade mt-3 flex items-center gap-2">
						<span class="text-xs text-neutral-500">
							{totalResults} result{totalResults !== 1 ? 's' : ''}
						</span>
						<div class="h-px flex-1 bg-gradient-to-r from-white/[0.06] to-transparent"></div>
					</div>
				{/if}
			</div>

			<!-- Results area (scrollable) -->
			<div class="scrollbar-thin flex-1 overflow-y-auto px-4 pb-4 sm:px-6">
				{#if !hasSearched}
					<!-- Empty state -->
					<div class="animate-fade-in flex h-full flex-col items-center justify-center py-20">
						<div class="relative">
							<!-- Decorative gradient blob -->
							<div
								class="absolute -inset-16 rounded-full bg-gradient-to-r from-blue-500/5 via-violet-500/5
								to-blue-500/5 blur-3xl"
							></div>

							<svg
								class="relative h-20 w-20 text-neutral-700"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="0.75"
									d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
								/>
							</svg>
						</div>
						<p class="mt-6 text-sm text-neutral-500">Discover movies and TV shows</p>
						<p class="mt-1 text-xs text-neutral-600">Search to find details and torrents</p>
					</div>
				{:else}
					<DiscoverSearchResults
						results={searchResults}
						{loading}
						{downloadedIds}
						onSelect={selectItem}
					/>
				{/if}
			</div>
		</div>
	{:else if view === 'detail' && selectedItem}
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- DETAIL VIEW                                                        -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<div class="scrollbar-thin animate-page-enter h-full overflow-y-auto">
			<MediaDetailPage item={selectedItem} onBack={goBack} {onDownload} {downloadingIds} />
		</div>
	{/if}
</div>
