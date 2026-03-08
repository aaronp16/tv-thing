<script lang="ts">
	/**
	 * Browse section — shown as the Discover empty-state.
	 * Two tabs: Trending (TMDB /trending) and Top Rated (TMDB /discover?sort_by=vote_average.desc).
	 * Supports server-side genre, year, and month filters with infinite scroll.
	 */
	import PosterImage from '$lib/components/ui/PosterImage.svelte';
	import StarRating from '$lib/components/ui/StarRating.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import DownloadedCheck from '$lib/components/ui/DownloadedCheck.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import { tmdbDisplayTitle, tmdbYear, TMDB_GENRES, type TMDBSearchResult } from '$lib/types';

	interface Props {
		onSelect: (item: TMDBSearchResult) => void;
		downloadedIds?: Set<number>;
		onCheckDownloadStatus?: (items: TMDBSearchResult[]) => void;
	}

	let { onSelect, downloadedIds = new Set(), onCheckDownloadStatus }: Props = $props();

	// ─── State ────────────────────────────────────────────────────────────────

	type ActiveTab = 'trending' | 'top';
	type MediaFilter = 'all' | 'movie' | 'tv';

	let activeTab = $state<ActiveTab>('trending');
	let mediaFilter = $state<MediaFilter>('all');
	let selectedGenre = $state<number | null>(null);
	// yearValue encodes both year and mode: "" | "in:2024" | "since:2024"
	let yearValue = $state<string>('');
	let selectedMonth = $state<number | null>(null);

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

	// Parse yearValue into { year, mode }
	const parsedYear = $derived.by(() => {
		if (!yearValue) return null;
		const [mode, y] = yearValue.split(':');
		return { year: Number(y), mode: mode as 'in' | 'since' };
	});

	// Whether any filter is active (forces /discover instead of /trending)
	const hasActiveFilters = $derived(selectedGenre !== null || parsedYear !== null);

	// On Trending with no active filters, 'all' is valid; otherwise resolve to movie/tv
	const effectiveMediaType = $derived.by((): 'movie' | 'tv' | 'all' => {
		if (activeTab === 'top') return mediaFilter === 'all' ? 'movie' : mediaFilter;
		if (hasActiveFilters) return mediaFilter === 'all' ? 'movie' : mediaFilter;
		return mediaFilter;
	});

	// 30-day threshold for "NEW" badge
	const NEW_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;

	function isNew(item: TMDBSearchResult): boolean {
		const dateStr = item.release_date || item.first_air_date;
		if (!dateStr) return false;
		const releaseDate = new Date(dateStr);
		const now = new Date();
		const diff = now.getTime() - releaseDate.getTime();
		return diff >= 0 && diff <= NEW_THRESHOLD_MS;
	}

	// Genres for the select: always the full static list, alphabetical
	const genreOptions = Object.entries(TMDB_GENRES)
		.map(([id, name]) => ({ id: Number(id), name }))
		.sort((a, b) => a.name.localeCompare(b.name));

	// Year options: current year down to 100 years ago
	const currentYear = new Date().getFullYear();
	const yearOptions = Array.from({ length: 101 }, (_, i) => currentYear - i);

	// Month names
	const MONTH_NAMES = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	];

	// Show month select only when year is set to "in" mode
	const showMonthSelect = $derived(parsedYear !== null && parsedYear.mode === 'in');

	// ─── Data fetching ────────────────────────────────────────────────────────

	async function fetchItems(pageNum: number, append: boolean = false) {
		if (append) {
			loadingMore = true;
		} else {
			loading = true;
			error = null;
		}

		try {
			let url: string;

			if (activeTab === 'trending' && !hasActiveFilters) {
				// Pure trending — fast TMDB trending endpoint
				const params = new URLSearchParams({
					type: effectiveMediaType as string,
					window: 'week',
					page: String(pageNum)
				});
				url = `/api/tmdb/trending?${params}`;
			} else {
				// Discover — supports all filters + Top Rated sort
				const mt = effectiveMediaType === 'all' ? 'movie' : effectiveMediaType;
				const params = new URLSearchParams({
					type: mt,
					sort_by: activeTab === 'top' ? 'vote_average.desc' : 'popularity.desc',
					page: String(pageNum)
				});
				if (selectedGenre) params.set('genre', String(selectedGenre));
				if (parsedYear) {
					params.set('year', String(parsedYear.year));
					params.set('year_mode', parsedYear.mode);
					if (selectedMonth && parsedYear.mode === 'in') {
						params.set('month', String(selectedMonth));
					}
				}
				url = `/api/tmdb/discover?${params}`;
			}

			const res = await fetch(url);
			if (!res.ok) throw new Error('Failed to fetch');
			const data = await res.json();

			if (append) {
				allItems = [...allItems, ...data.results];
			} else {
				allItems = data.results;
			}
			page = data.page;
			totalPages = data.totalPages;

			onCheckDownloadStatus?.(data.results);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load';
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	function loadNextPage() {
		if (loadingMore || page >= totalPages) return;
		fetchItems(page + 1, true);
	}

	// Reset and refetch whenever any filter/tab changes
	$effect(() => {
		// Track reactive deps
		const _tab = activeTab;
		const _mt = effectiveMediaType;
		const _genre = selectedGenre;
		const _year = yearValue;
		const _month = selectedMonth;

		allItems = [];
		page = 1;
		totalPages = 1;
		fetchItems(1);
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

	// ─── Actions ──────────────────────────────────────────────────────────────

	function selectTab(tab: ActiveTab) {
		if (tab === activeTab) return;
		activeTab = tab;
		// Top tab can't use 'all' — switch to movie, but keep other filters
		if (tab === 'top' && mediaFilter === 'all') mediaFilter = 'movie';
	}

	function handleYearChange(e: Event) {
		yearValue = (e.target as HTMLSelectElement).value;
		// Reset month when year changes or is cleared
		selectedMonth = null;
	}

	function handleMonthChange(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		selectedMonth = val ? Number(val) : null;
	}

	function handleGenreChange(e: Event) {
		const val = (e.target as HTMLSelectElement).value;
		selectedGenre = val ? Number(val) : null;
	}

	function handleTypeChange(e: Event) {
		const val = (e.target as HTMLSelectElement).value as MediaFilter;
		mediaFilter = val;
	}

	const hasAnyFilter = $derived(
		selectedGenre !== null ||
			yearValue !== '' ||
			selectedMonth !== null ||
			(activeTab === 'top' ? false : mediaFilter !== 'all') ||
			(activeTab === 'top' && mediaFilter !== 'movie')
	);
</script>

<!-- Shared select style applied via a snippet approach — use a class string -->
<div class="flex flex-col gap-3">
	<!-- ── Tab bar + filters row ────────────────────────────────────── -->
	<div class="flex flex-wrap items-center gap-2">
		<!-- Tab toggle -->
		<div class="flex items-center rounded-lg bg-neutral-800/80 p-0.5 ring-1 ring-white/[0.06]">
			<button
				type="button"
				onclick={() => selectTab('trending')}
				class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all
					{activeTab === 'trending'
					? 'bg-white/10 text-white shadow-sm'
					: 'text-neutral-400 hover:text-neutral-300'}"
			>
				<svg
					class="h-3 w-3 {activeTab === 'trending' ? 'text-orange-400' : 'text-neutral-500'}"
					viewBox="0 0 24 24"
					fill="currentColor"
				>
					<path
						d="M17.66 11.2c-.23-.3-.51-.56-.77-.82-.67-.6-1.43-1.03-2.07-1.66C13.33 7.26 13 5.86 13.95 4c-1.73.46-2.96 1.77-3.44 3.3-.03.12-.07.25-.1.36-.16.67-.04 1.34.25 1.96.18.37.23.77.05 1.08-.26.47-.83.63-1.35.4-.2-.1-.36-.24-.5-.4-.02-.02-.04-.05-.06-.07C7.3 12.37 8.1 14.93 10 16.3c.08.06.17.1.25.16-.12-.1-.24-.22-.34-.33-.3-.33-.5-.73-.6-1.16-.1-.5.02-1.05.42-1.35.3-.22.7-.27 1.05-.15.25.08.48.24.65.45.55.65 1.36 1.04 2.17.95.63-.07 1.2-.42 1.6-.93.3-.38.45-.84.4-1.3-.05-.45-.3-.84-.7-1.1-.22-.14-.47-.2-.72-.26z"
					/>
				</svg>
				Trending
			</button>
			<button
				type="button"
				onclick={() => selectTab('top')}
				class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all
					{activeTab === 'top'
					? 'bg-white/10 text-white shadow-sm'
					: 'text-neutral-400 hover:text-neutral-300'}"
			>
				<svg
					class="h-3 w-3 {activeTab === 'top' ? 'text-yellow-400' : 'text-neutral-500'}"
					viewBox="0 0 24 24"
					fill="currentColor"
				>
					<path
						d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
					/>
				</svg>
				Top Rated
			</button>
		</div>

		<!-- Divider -->
		<div class="h-5 w-px bg-white/10"></div>

		<!-- Type select -->
		<div class="relative">
			<select
				value={mediaFilter}
				onchange={handleTypeChange}
				class="h-8 appearance-none rounded-lg border-0 bg-neutral-800 py-0 pr-7 pl-3 text-xs text-neutral-200
					ring-1 ring-white/[0.08] transition-colors hover:bg-neutral-700 focus:ring-2 focus:ring-blue-500 focus:outline-none
					{mediaFilter !== 'all' ? 'text-white ring-white/20' : ''}"
			>
				{#if activeTab === 'trending' && !hasActiveFilters}
					<option value="all">All</option>
				{/if}
				<option value="movie">Movies</option>
				<option value="tv">TV Shows</option>
			</select>
			<div class="pointer-events-none absolute inset-y-0 right-2 flex items-center">
				<svg class="h-3 w-3 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2.5"
						d="M19 9l-7 7-7-7"
					/>
				</svg>
			</div>
		</div>

		<!-- Genre select -->
		<div class="relative">
			<select
				value={selectedGenre ?? ''}
				onchange={handleGenreChange}
				class="h-8 appearance-none rounded-lg border-0 bg-neutral-800 py-0 pr-7 pl-3 text-xs
					ring-1 ring-white/[0.08] transition-colors hover:bg-neutral-700 focus:ring-2 focus:ring-blue-500 focus:outline-none
					{selectedGenre !== null ? 'text-white ring-white/20' : 'text-neutral-400'}"
			>
				<option value="">Genre</option>
				{#each genreOptions as g (g.id)}
					<option value={g.id}>{g.name}</option>
				{/each}
			</select>
			<div class="pointer-events-none absolute inset-y-0 right-2 flex items-center">
				<svg class="h-3 w-3 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2.5"
						d="M19 9l-7 7-7-7"
					/>
				</svg>
			</div>
		</div>

		<!-- Year select -->
		<div class="relative">
			<select
				value={yearValue}
				onchange={handleYearChange}
				class="h-8 appearance-none rounded-lg border-0 bg-neutral-800 py-0 pr-7 pl-3 text-xs
					ring-1 ring-white/[0.08] transition-colors hover:bg-neutral-700 focus:ring-2 focus:ring-blue-500 focus:outline-none
					{yearValue !== '' ? 'text-white ring-white/20' : 'text-neutral-400'}"
			>
				<option value="">Year</option>
				<optgroup label="In year">
					{#each yearOptions as y (y)}
						<option value="in:{y}">{y}</option>
					{/each}
				</optgroup>
				<optgroup label="Since year">
					{#each yearOptions as y (y)}
						<option value="since:{y}">Since {y}</option>
					{/each}
				</optgroup>
			</select>
			<div class="pointer-events-none absolute inset-y-0 right-2 flex items-center">
				<svg class="h-3 w-3 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2.5"
						d="M19 9l-7 7-7-7"
					/>
				</svg>
			</div>
		</div>

		<!-- Month select — only when year is set to "in" mode -->
		{#if showMonthSelect}
			<div class="relative">
				<select
					value={selectedMonth ?? ''}
					onchange={handleMonthChange}
					class="h-8 appearance-none rounded-lg border-0 bg-neutral-800 py-0 pr-7 pl-3 text-xs
						ring-1 ring-white/[0.08] transition-colors hover:bg-neutral-700 focus:ring-2 focus:ring-blue-500 focus:outline-none
						{selectedMonth !== null ? 'text-white ring-white/20' : 'text-neutral-400'}"
				>
					<option value="">Month</option>
					{#each MONTH_NAMES as name, i}
						<option value={i + 1}>{name}</option>
					{/each}
				</select>
				<div class="pointer-events-none absolute inset-y-0 right-2 flex items-center">
					<svg
						class="h-3 w-3 text-neutral-500"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2.5"
							d="M19 9l-7 7-7-7"
						/>
					</svg>
				</div>
			</div>
		{/if}

		<!-- Clear all filters -->
		{#if selectedGenre !== null || yearValue !== '' || (activeTab === 'top' && mediaFilter !== 'movie' && mediaFilter !== 'all')}
			<button
				type="button"
				onclick={() => {
					selectedGenre = null;
					yearValue = '';
					selectedMonth = null;
					if (activeTab === 'trending') mediaFilter = 'all';
				}}
				class="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-neutral-500 transition-colors hover:text-neutral-300"
			>
				<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
				Clear
			</button>
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
			<p class="text-sm font-medium text-red-400">Couldn't load content</p>
			<p class="mt-1 text-xs text-neutral-600">{error}</p>
			<button
				type="button"
				onclick={() => fetchItems(1)}
				class="mt-3 text-xs text-blue-400 transition-colors hover:text-blue-300"
			>
				Try again
			</button>
		</div>
	{:else if allItems.length === 0}
		<div class="animate-fade-in py-12 text-center">
			<p class="text-sm text-neutral-500">No results found</p>
			{#if selectedGenre || yearValue}
				<button
					type="button"
					onclick={() => {
						selectedGenre = null;
						yearValue = '';
						selectedMonth = null;
					}}
					class="mt-2 text-xs text-blue-400 transition-colors hover:text-blue-300"
				>
					Clear filters
				</button>
			{/if}
		</div>
	{:else}
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
			{#each allItems as item, i (item.id)}
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
					<div class="card-hover relative overflow-hidden rounded-xl ring-1 ring-white/[0.06]">
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
							class="truncate text-sm font-medium text-neutral-200 transition-colors group-hover:text-white"
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
