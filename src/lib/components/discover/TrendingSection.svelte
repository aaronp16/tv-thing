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
	import AvailabilityBadge from '$lib/components/ui/AvailabilityBadge.svelte';
	import { formatReleaseDate, isUnreleased } from '$lib/format';
	import { fade, fly } from 'svelte/transition';
	import { portal } from '$lib/actions/portal';
	import { tmdbDisplayTitle, tmdbYear, TMDB_GENRES, type TMDBSearchResult } from '$lib/types';

	interface Props {
		onSelect: (item: TMDBSearchResult) => void;
		downloadedIds?: Set<number>;
		onCheckDownloadStatus?: (items: TMDBSearchResult[]) => void;
	}

	let { onSelect, downloadedIds = new Set(), onCheckDownloadStatus }: Props = $props();

	// ─── State ────────────────────────────────────────────────────────────────

	type ActiveTab = 'trending' | 'top';
	type MediaFilter = 'movie' | 'tv';

	let activeTab = $state<ActiveTab>('trending');
	let mediaFilter = $state<MediaFilter>('movie');
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

	// Hide titles that are only in cinemas or not out yet (remembered per browser)
	const HIDE_UNRELEASED_KEY = 'tv-thing:hideUnreleased';
	let hideUnreleased = $state(false);
	try {
		hideUnreleased = localStorage.getItem(HIDE_UNRELEASED_KEY) === '1';
	} catch {
		// Storage unavailable — default to showing everything
	}

	function toggleHideUnreleased() {
		hideUnreleased = !hideUnreleased;
		try {
			localStorage.setItem(HIDE_UNRELEASED_KEY, hideUnreleased ? '1' : '0');
		} catch {
			// Not persisted, still applies for this session
		}
	}

	const visibleItems = $derived(
		hideUnreleased ? allItems.filter((i) => !isUnreleased(i.availability)) : allItems
	);
	const hiddenCount = $derived(allItems.length - visibleItems.length);

	// Filter sheet (narrow screens)
	let filtersOpen = $state(false);
	const activeFilterCount = $derived(
		(selectedGenre !== null ? 1 : 0) + (yearValue ? 1 : 0) + (hideUnreleased ? 1 : 0)
	);

	function clearFilters() {
		selectedGenre = null;
		yearValue = '';
		selectedMonth = null;
		hideUnreleased = false;
		try {
			localStorage.setItem(HIDE_UNRELEASED_KEY, '0');
		} catch {
			// Not persisted
		}
	}

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

	/** Movies and TV shows have separate TMDB ID spaces */
	const itemKey = (item: TMDBSearchResult) => `${item.media_type}:${item.id}`;

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
	// TMDB uses separate genre IDs for movies and TV, so only offer the ones
	// that apply to the current Movies / TV choice
	const MOVIE_GENRES = [
		28, 12, 16, 35, 80, 99, 18, 10751, 14, 36, 27, 10402, 9648, 10749, 878, 10770, 53, 10752, 37
	];
	const TV_GENRES = [
		10759, 16, 35, 80, 99, 18, 10751, 10762, 9648, 10763, 10764, 10765, 10766, 10767, 10768, 37
	];

	const genreOptions = $derived(
		(mediaFilter === 'tv' ? TV_GENRES : MOVIE_GENRES)
			.map((id) => ({ id, name: TMDB_GENRES[id] }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);

	// Drop a genre that doesn't exist for the newly chosen type
	$effect(() => {
		const valid = mediaFilter === 'tv' ? TV_GENRES : MOVIE_GENRES;
		if (selectedGenre !== null && !valid.includes(selectedGenre)) selectedGenre = null;
	});

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
					type: mediaFilter,
					window: 'week',
					page: String(pageNum)
				});
				url = `/api/tmdb/trending?${params}`;
			} else {
				// Discover — supports all filters + Top Rated sort
				const mt = mediaFilter;
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
				// Rankings shift between page loads, so a title can appear on two pages
				const seen = new Set(allItems.map(itemKey));
				allItems = [
					...allItems,
					...data.results.filter((r: TMDBSearchResult) => !seen.has(itemKey(r)))
				];
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
		const _mt = mediaFilter;
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
</script>

<!-- Shared select style applied via a snippet approach — use a class string -->
<div class="flex flex-col gap-3">
	<!-- ── Tab bar + filters row ────────────────────────────────────── -->
	<div class="flex flex-wrap items-center gap-x-5 gap-y-2">
		<!-- Tab toggle -->
		<div class="mr-1 flex items-baseline gap-3 sm:gap-4">
			<button
				type="button"
				onclick={() => selectTab('trending')}
				class="font-display text-[22px] transition-colors sm:text-[26px] {activeTab === 'trending'
					? 'text-white'
					: 'text-neutral-600 hover:text-neutral-400'}"
			>
				<svg class="hidden" viewBox="0 0 24 24" fill="currentColor">
					<path
						d="M17.66 11.2c-.23-.3-.51-.56-.77-.82-.67-.6-1.43-1.03-2.07-1.66C13.33 7.26 13 5.86 13.95 4c-1.73.46-2.96 1.77-3.44 3.3-.03.12-.07.25-.1.36-.16.67-.04 1.34.25 1.96.18.37.23.77.05 1.08-.26.47-.83.63-1.35.4-.2-.1-.36-.24-.5-.4-.02-.02-.04-.05-.06-.07C7.3 12.37 8.1 14.93 10 16.3c.08.06.17.1.25.16-.12-.1-.24-.22-.34-.33-.3-.33-.5-.73-.6-1.16-.1-.5.02-1.05.42-1.35.3-.22.7-.27 1.05-.15.25.08.48.24.65.45.55.65 1.36 1.04 2.17.95.63-.07 1.2-.42 1.6-.93.3-.38.45-.84.4-1.3-.05-.45-.3-.84-.7-1.1-.22-.14-.47-.2-.72-.26z"
					/>
				</svg>
				Trending
			</button>
			<button
				type="button"
				onclick={() => selectTab('top')}
				class="font-display text-[22px] transition-colors sm:text-[26px] {activeTab === 'top'
					? 'text-white'
					: 'text-neutral-600 hover:text-neutral-400'}"
			>
				<svg class="hidden" viewBox="0 0 24 24" fill="currentColor">
					<path
						d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
					/>
				</svg>
				Top Rated
			</button>
		</div>

		<!-- Divider -->
		<div class="hidden h-5 w-px bg-white/10 xl:block"></div>

		<!-- Inline filters (wide screens; narrower ones use the filter sheet) -->
		<div class="hidden items-center gap-x-5 xl:flex">
			<!-- Genre select -->
			<label
				class="relative inline-flex cursor-pointer items-baseline gap-1 font-display text-[22px] leading-none transition-colors focus-within:text-white {selectedGenre !==
				null
					? 'text-white'
					: 'text-neutral-600 hover:text-neutral-400'}"
			>
				{selectedGenre !== null ? TMDB_GENRES[selectedGenre] : 'Genre'}
				<svg
					class="h-3 w-3 self-center text-neutral-600"
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
				<!-- Native select laid over the label: real dropdown + keyboard support, sized to the label -->
				<select
					value={selectedGenre ?? ''}
					onchange={handleGenreChange}
					aria-label="Genre"
					class="absolute inset-0 cursor-pointer opacity-0 [&_option]:bg-neutral-900 [&_option]:text-neutral-100"
				>
					<option value="">Any genre</option>
					{#each genreOptions as g (g.id)}
						<option value={g.id}>{g.name}</option>
					{/each}
				</select>
			</label>

			<!-- Year select -->
			<label
				class="relative inline-flex cursor-pointer items-baseline gap-1 font-display text-[22px] leading-none transition-colors focus-within:text-white {yearValue !==
				''
					? 'text-white'
					: 'text-neutral-600 hover:text-neutral-400'}"
			>
				{parsedYear
					? parsedYear.mode === 'since'
						? `Since ${parsedYear.year}`
						: parsedYear.year
					: 'Year'}
				<svg
					class="h-3 w-3 self-center text-neutral-600"
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
				<!-- Native select laid over the label: real dropdown + keyboard support, sized to the label -->
				<select
					value={yearValue}
					onchange={handleYearChange}
					aria-label="Year"
					class="absolute inset-0 cursor-pointer opacity-0 [&_option]:bg-neutral-900 [&_option]:text-neutral-100"
				>
					<option value="">Any year</option>
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
			</label>

			{#if showMonthSelect}
				<!-- Month select — only when year is set to "in" mode -->
				<label
					class="relative inline-flex cursor-pointer items-baseline gap-1 font-display text-[22px] leading-none transition-colors focus-within:text-white {selectedMonth !==
					null
						? 'text-white'
						: 'text-neutral-600 hover:text-neutral-400'}"
				>
					{selectedMonth !== null ? MONTH_NAMES[selectedMonth - 1] : 'Month'}
					<svg
						class="h-3 w-3 self-center text-neutral-600"
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
					<!-- Native select laid over the label: real dropdown + keyboard support, sized to the label -->
					<select
						value={selectedMonth ?? ''}
						onchange={handleMonthChange}
						aria-label="Month"
						class="absolute inset-0 cursor-pointer opacity-0 [&_option]:bg-neutral-900 [&_option]:text-neutral-100"
					>
						<option value="">Any month</option>
						{#each MONTH_NAMES as name, i}
							<option value={i + 1}>{name}</option>
						{/each}
					</select>
				</label>
			{/if}

			<!-- Released-only toggle -->
			<button
				type="button"
				onclick={toggleHideUnreleased}
				aria-pressed={hideUnreleased}
				class="font-display text-[22px] leading-none transition-colors {hideUnreleased
					? 'text-white'
					: 'text-neutral-600 hover:text-neutral-400'}"
				title="Hide movies that are only in cinemas and shows that haven't aired"
			>
				Released only{#if hideUnreleased && hiddenCount > 0}<span
						class="ml-1.5 align-middle font-mono text-[11px] text-neutral-500"
						>{hiddenCount} hidden</span
					>{/if}
			</button>

			<!-- Clear all filters -->
			{#if selectedGenre !== null || yearValue !== ''}
				<button
					type="button"
					onclick={() => {
						selectedGenre = null;
						yearValue = '';
						selectedMonth = null;
					}}
					class="flex items-center gap-1 eyebrow text-neutral-500 transition-colors hover:text-neutral-300"
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

		<!-- Movies / TV toggle -->
		<div class="ml-auto flex items-baseline gap-3 sm:gap-4">
			{#each [['movie', 'Movies'], ['tv', 'TV']] as const as [val, label] (val)}
				<button
					type="button"
					onclick={() => (mediaFilter = val)}
					aria-pressed={mediaFilter === val}
					class="font-display text-[22px] transition-colors sm:text-[26px] {mediaFilter === val
						? 'text-white'
						: 'text-neutral-600 hover:text-neutral-400'}"
				>
					{label}
				</button>
			{/each}
		</div>

		<!-- Filter sheet button (below xl) -->
		<button
			type="button"
			onclick={() => (filtersOpen = true)}
			aria-label="Filters{activeFilterCount ? ` (${activeFilterCount} active)` : ''}"
			class="relative -mr-1 flex h-9 w-9 items-center justify-center self-center rounded-md transition-colors xl:hidden
				{activeFilterCount ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'}"
		>
			<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2">
				<path stroke-linecap="round" d="M4 7h10M18 7h2M4 17h4M12 17h8" />
				<circle cx="16" cy="7" r="2" />
				<circle cx="10" cy="17" r="2" />
			</svg>
			{#if activeFilterCount}
				<span
					class="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-[3px] bg-gold-400 px-1 font-mono text-[10px] leading-none text-black"
					>{activeFilterCount}</span
				>
			{/if}
		</button>
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
			<div class="mb-3 rounded-full bg-brick-900/20 p-3">
				<svg class="h-6 w-6 text-brick-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
					/>
				</svg>
			</div>
			<p class="text-sm font-medium text-brick-400">Couldn't load content</p>
			<p class="mt-1 text-xs text-neutral-600">{error}</p>
			<button
				type="button"
				onclick={() => fetchItems(1)}
				class="mt-3 text-xs text-gold-400 transition-colors hover:text-gold-300"
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
					class="mt-2 text-xs text-gold-400 transition-colors hover:text-gold-300"
				>
					Clear filters
				</button>
			{/if}
		</div>
	{:else}
		{#if visibleItems.length === 0}
			<div class="animate-fade-in py-12 text-center">
				<p class="text-sm text-neutral-500">
					All {allItems.length} titles loaded so far are unreleased
				</p>
				<button
					type="button"
					onclick={toggleHideUnreleased}
					class="mt-2 text-xs text-gold-400 transition-colors hover:text-gold-300"
				>
					Show them anyway
				</button>
			</div>
		{/if}
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
			{#each visibleItems as item, i (itemKey(item))}
				{@const title = tmdbDisplayTitle(item)}
				{@const year = tmdbYear(item)}
				{@const itemIsNew = isNew(item)}
				{@const isDownloaded = downloadedIds.has(item.id)}
				{@const unreleased = isUnreleased(item.availability)}

				<button
					type="button"
					onclick={() => onSelect(item)}
					class="group animate-float-up rounded-xl text-left focus:outline-none
						focus-visible:ring-2 focus-visible:ring-gold-500/50"
					style="animation-delay: {Math.min(i, 20) * 30}ms"
				>
					<!-- Poster -->
					<div class="card-hover relative overflow-hidden rounded-md bg-neutral-850">
						<PosterImage
							path={item.poster_path}
							alt={title}
							size="w342"
							class="w-full transition-[filter] duration-300 {item.availability?.status ===
							'upcoming'
								? 'brightness-[0.6] saturate-[0.6] group-hover:brightness-90 group-hover:saturate-100'
								: ''}"
						/>

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
						<div class="absolute top-2 left-2 flex flex-col items-start gap-1">
							<Badge variant={item.media_type === 'movie' ? 'primary' : 'accent'} size="xs">
								{item.media_type === 'movie' ? 'Movie' : 'TV'}
							</Badge>
							{#if unreleased}
								<AvailabilityBadge availability={item.availability} />
							{:else if itemIsNew}
								<span
									class="inline-flex items-center rounded-[3px] bg-gold-400 px-1 py-[3px] font-mono text-[9.5px] leading-none font-medium tracking-wider text-black"
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
								class="absolute right-2 bottom-2 rounded-[3px] bg-neutral-950/75 px-1.5 py-1 backdrop-blur-sm"
							>
								<StarRating score={item.vote_average} size="sm" />
							</div>
						{/if}
					</div>

					<!-- Text below poster -->
					<div class="mt-2 px-0.5">
						<h3
							class="truncate font-display text-[17px] text-neutral-100 transition-colors group-hover:text-gold-200"
						>
							{title}
						</h3>
						<div class="mt-0.5 flex items-center gap-2">
							{#if year}
								<span class="font-mono text-[11px] text-neutral-500">{year}</span>
							{/if}
							{#if item.availability?.status === 'cinema'}
								<span class="truncate font-mono text-[11px] text-ember-300">
									{item.availability.date
										? `Digital ${formatReleaseDate(item.availability.date)}`
										: 'No digital date yet'}
								</span>
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

<!-- ── Filter sheet (below xl) ──────────────────────────────────── -->
{#if filtersOpen}
	<div
		use:portal
		class="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4 xl:hidden"
		onclick={(e) => e.target === e.currentTarget && (filtersOpen = false)}
		onkeydown={(e) => e.key === 'Escape' && (filtersOpen = false)}
		role="presentation"
		transition:fade={{ duration: 150 }}
	>
		<div
			class="flex max-h-[85vh] w-full flex-col rounded-t-xl border-t border-neutral-800 bg-neutral-900 sm:max-w-md sm:rounded-lg sm:border"
			style="padding-bottom: env(safe-area-inset-bottom, 0px)"
			role="dialog"
			aria-modal="true"
			aria-label="Filters"
			transition:fly={{ y: 400, duration: 250, opacity: 1 }}
		>
			<!-- Grab handle + header -->
			<div class="mx-auto mt-2 h-1 w-10 rounded-full bg-neutral-700 sm:hidden"></div>
			<div class="flex items-baseline justify-between px-5 pt-3 pb-2">
				<h2 class="font-display text-3xl text-white">Filters</h2>
				{#if activeFilterCount}
					<button
						type="button"
						onclick={clearFilters}
						class="eyebrow text-neutral-500 transition-colors hover:text-neutral-300"
						>Clear all</button
					>
				{/if}
			</div>

			<div class="scrollbar-thin min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-3">
				<!-- Genre chips -->
				<section>
					<h3 class="mb-2.5 eyebrow text-gold-400">Genre</h3>
					<div class="flex flex-wrap gap-1.5">
						{#each [{ id: null, name: 'Any' }, ...genreOptions] as g (g.id ?? 'any')}
							<button
								type="button"
								onclick={() => (selectedGenre = g.id)}
								aria-pressed={selectedGenre === g.id}
								class="rounded-[3px] px-2.5 py-1.5 text-sm transition-colors {selectedGenre === g.id
									? 'bg-gold-400 text-black'
									: 'bg-neutral-800 text-neutral-300 hover:bg-neutral-750'}"
							>
								{g.name}
							</button>
						{/each}
					</div>
				</section>

				<!-- Year (+ month) -->
				<section>
					<h3 class="mb-2.5 eyebrow text-gold-400">Released</h3>
					<div class="grid gap-2 {showMonthSelect ? 'grid-cols-2' : 'grid-cols-1'}">
						<label
							class="relative flex items-center justify-between rounded-md bg-neutral-800 px-3 py-2.5 text-sm {yearValue
								? 'text-white'
								: 'text-neutral-400'}"
						>
							{parsedYear
								? parsedYear.mode === 'since'
									? `Since ${parsedYear.year}`
									: parsedYear.year
								: 'Any year'}
							<svg
								class="h-4 w-4 text-neutral-500"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								><path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2.5"
									d="M19 9l-7 7-7-7"
								/></svg
							>
							<select
								value={yearValue}
								onchange={handleYearChange}
								aria-label="Year"
								class="absolute inset-0 cursor-pointer opacity-0"
							>
								<option value="">Any year</option>
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
						</label>
						{#if showMonthSelect}
							<label
								class="relative flex items-center justify-between rounded-md bg-neutral-800 px-3 py-2.5 text-sm {selectedMonth !==
								null
									? 'text-white'
									: 'text-neutral-400'}"
							>
								{selectedMonth !== null ? MONTH_NAMES[selectedMonth - 1] : 'Any month'}
								<svg
									class="h-4 w-4 text-neutral-500"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									><path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2.5"
										d="M19 9l-7 7-7-7"
									/></svg
								>
								<select
									value={selectedMonth ?? ''}
									onchange={handleMonthChange}
									aria-label="Month"
									class="absolute inset-0 cursor-pointer opacity-0"
								>
									<option value="">Any month</option>
									{#each MONTH_NAMES as name, i}
										<option value={i + 1}>{name}</option>
									{/each}
								</select>
							</label>
						{/if}
					</div>
				</section>

				<!-- Released only -->
				<button
					type="button"
					onclick={toggleHideUnreleased}
					role="switch"
					aria-checked={hideUnreleased}
					class="flex w-full items-center justify-between gap-4 text-left"
				>
					<span>
						<span class="block text-sm text-white">Released only</span>
						<span class="block text-xs text-neutral-500"
							>Hide films only in cinemas and shows that haven't aired</span
						>
					</span>
					<span
						class="relative h-6 w-10 flex-shrink-0 rounded-full transition-colors {hideUnreleased
							? 'bg-gold-400'
							: 'bg-neutral-700'}"
					>
						<span
							class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform {hideUnreleased
								? 'translate-x-4'
								: ''}"
						></span>
					</span>
				</button>
			</div>

			<div class="border-t border-neutral-800 px-5 py-3">
				<button
					type="button"
					onclick={() => (filtersOpen = false)}
					class="w-full rounded-md bg-gold-400 py-3 text-sm font-semibold text-black transition-colors hover:bg-gold-300"
				>
					Show {hideUnreleased && hiddenCount
						? `${visibleItems.length} of ${allItems.length}`
						: 'results'}
				</button>
			</div>
		</div>
	</div>
{/if}
