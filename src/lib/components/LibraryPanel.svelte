<script lang="ts">
	/**
	 * Library panel — shows the user's Jellyfin media library as a poster grid.
	 * Mirrors the book-thing library panel style.
	 * Clicking an item calls onSelect so the parent can navigate to its detail page.
	 * The "Watch list" tab shows titles waiting to arrive in the library.
	 * Downloads in progress appear at the top of Movies / TV Shows and in the
	 * "Downloading" tab.
	 */
	import type { ActiveDownload, JellyfinItem, WatchlistItem } from '$lib/types';
	import { tmdbImage } from '$lib/types';
	import { onMount } from 'svelte';
	import { watchlist } from '$lib/stores/watchlist';
	import { activeDownloads, libraryFocus, startDownloadPolling } from '$lib/stores/downloads';
	import DownloadTile from './DownloadTile.svelte';

	interface Props {
		onSelect: (item: JellyfinItem) => void;
		onOpenTmdb: (tmdbId: number, mediaType: 'movie' | 'tv') => void;
	}

	let { onSelect, onOpenTmdb }: Props = $props();

	type FilterType = 'movies' | 'tvshows' | 'downloading' | 'watchlist';

	let items = $state<JellyfinItem[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let filterType = $state<FilterType>('movies');
	let filterQuery = $state('');
	let filterInput = $state<HTMLInputElement | null>(null);

	// Filtered items based on type tab + text filter
	const filteredItems = $derived.by(() => {
		let list = items;
		if (filterType === 'movies') list = list.filter((i) => i.type === 'Movie');
		else if (filterType === 'tvshows') list = list.filter((i) => i.type === 'Series');

		if (filterQuery.trim()) {
			const q = filterQuery.toLowerCase();
			list = list.filter((i) => i.name.toLowerCase().includes(q));
		}
		return list;
	});

	const filteredDownloads = $derived.by(() => {
		let list = $activeDownloads;
		if (filterType === 'movies') list = list.filter((d) => d.mediaType === 'movie');
		else if (filterType === 'tvshows') list = list.filter((d) => d.mediaType === 'tv');
		const q = filterQuery.trim().toLowerCase();
		return q ? list.filter((d) => d.title.toLowerCase().includes(q)) : list;
	});

	// Jump to the right tab when a download starts. Never reset, so a panel
	// mounted afterwards (mobile Library tab) opens on it too.
	$effect(() => {
		if ($libraryFocus) filterType = $libraryFocus.tab;
	});

	// When a download finishes, reload the library so it shows up (Jellyfin
	// is asked to rescan; give it a moment, then check again later)
	let knownDownloadIds = new Set<string>();
	$effect(() => {
		const ids = new Set($activeDownloads.map((d) => d.id));
		const finished = [...knownDownloadIds].some((id) => !ids.has(id));
		knownDownloadIds = ids;
		if (finished) {
			setTimeout(() => loadLibrary(true), 5000);
			setTimeout(() => loadLibrary(true), 30000);
		}
	});

	function openDownload(d: ActiveDownload): (() => void) | undefined {
		const tmdbId = d.tmdbId;
		return tmdbId ? () => onOpenTmdb(tmdbId, d.mediaType) : undefined;
	}

	const filteredWatchlist = $derived.by(() => {
		const q = filterQuery.trim().toLowerCase();
		return q ? $watchlist.filter((w) => w.title.toLowerCase().includes(q)) : $watchlist;
	});

	function setFilter(val: FilterType) {
		filterType = val;
		// Re-check on open so anything that just arrived drops off
		if (val === 'watchlist') watchlist.load();
	}

	function removeFromWatchlist(e: MouseEvent, item: WatchlistItem) {
		e.stopPropagation();
		watchlist.remove(item);
	}

	const movieCount = $derived(items.filter((i) => i.type === 'Movie').length);
	const tvCount = $derived(items.filter((i) => i.type === 'Series').length);

	/** quiet: refresh in the background without showing the loading skeleton */
	async function loadLibrary(quiet = false) {
		if (!quiet) loading = true;
		error = null;
		try {
			const res = await fetch('/api/library/items?type=all');
			if (!res.ok) throw new Error('Failed to load library');
			const data = await res.json();
			items = data.items || [];
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load library';
		} finally {
			loading = false;
		}
	}

	let disk = $state<{ total: number; free: number; used: number } | null>(null);
	const diskUsedPct = $derived(disk && disk.total > 0 ? (disk.used / disk.total) * 100 : 0);

	async function loadDisk() {
		try {
			const res = await fetch('/api/library/disk');
			if (res.ok) disk = await res.json();
		} catch {
			// Non-critical — just hide the indicator
		}
	}

	function refresh() {
		loadLibrary();
		loadDisk();
		watchlist.load();
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
	}

	function clearFilter() {
		filterQuery = '';
		filterInput?.focus();
	}

	onMount(() => {
		refresh();
		startDownloadPolling();
	});

	// Skeleton count for loading state
	const SKELETON_COUNT = 12;
</script>

<div class="flex h-full flex-col">
	<!-- ── Header ─────────────────────────────────────────────────── -->
	<div class="flex-shrink-0 border-b border-neutral-800 px-4 pt-4 pb-4 sm:px-6">
		<div class="mb-3 flex h-9 items-center justify-between">
			<h2 class="font-display text-[28px] text-white">Library</h2>
			<div class="flex items-center gap-3">
				{#if disk}
					<a
						href="/storage"
						class="flex items-center gap-2 rounded-full px-2 py-1 transition-colors hover:bg-neutral-800"
						title="{formatBytes(disk.used)} used of {formatBytes(disk.total)} — open storage map"
					>
						<div class="h-1.5 w-16 overflow-hidden rounded-full bg-neutral-800">
							<div
								class="h-full rounded-full {diskUsedPct > 90
									? 'bg-brick-500'
									: diskUsedPct > 75
										? 'bg-ember-500'
										: 'bg-gold-500'}"
								style="width: {diskUsedPct}%"
							></div>
						</div>
						<span class="font-mono text-[11px] whitespace-nowrap text-neutral-400"
							>{formatBytes(disk.free)} free</span
						>
					</a>
				{/if}
				<button
					type="button"
					onclick={refresh}
					aria-label="Refresh library"
					class="rounded-full p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-300"
				>
					<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
						/>
					</svg>
				</button>
			</div>
		</div>

		<!-- Filter type tabs -->
		<div class="scrollbar-none mb-4 flex gap-5 overflow-x-auto border-b border-neutral-800">
			{#each [['movies', 'Movies'], ['tvshows', 'TV Shows'], ['downloading', 'Downloading'], ['watchlist', 'Watch list']] as const as [val, label]}
				<button
					type="button"
					onclick={() => setFilter(val)}
					class="-mb-px border-b-2 pb-2 text-sm font-medium whitespace-nowrap transition-colors {filterType ===
					val
						? 'border-gold-400 text-white'
						: 'border-transparent text-neutral-500 hover:text-neutral-200'}"
				>
					{label}{#if val === 'movies' && movieCount > 0}<span
							class="ml-1 font-mono text-[11px] opacity-50">{movieCount}</span
						>{:else if val === 'tvshows' && tvCount > 0}<span
							class="ml-1 font-mono text-[11px] opacity-50">{tvCount}</span
						>{:else if val === 'downloading' && $activeDownloads.length > 0}<span
							class="ml-1 font-mono text-[11px] text-gold-400">{$activeDownloads.length}</span
						>{:else if val === 'watchlist' && $watchlist.length > 0}<span
							class="ml-1 font-mono text-[11px] opacity-50">{$watchlist.length}</span
						>{/if}
				</button>
			{/each}
		</div>

		<!-- Filter input -->
		{#if items.length > 0 || $activeDownloads.length > 0 || (filterType === 'watchlist' && $watchlist.length > 0)}
			<div class="relative">
				<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
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
							d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
						/>
					</svg>
				</div>
				<input
					bind:this={filterInput}
					type="text"
					bind:value={filterQuery}
					placeholder="Filter library..."
					class="w-full rounded-md border-0 bg-neutral-850 py-2.5 pl-12 text-sm text-white placeholder-neutral-500 ring-1 ring-neutral-800 transition-all focus:bg-neutral-800 focus:ring-1 focus:ring-gold-400/70 focus:outline-none {filterQuery
						? 'pr-10'
						: 'pr-4'}"
				/>
				{#if filterQuery}
					<button
						type="button"
						onclick={clearFilter}
						aria-label="Clear filter"
						class="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400
							transition-colors hover:text-white"
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
		{/if}
	</div>

	<!-- ── Content area ───────────────────────────────────────────── -->
	<div class="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-4">
		{#if filterType === 'watchlist'}
			{#if $watchlist.length === 0}
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<div class="mb-3 rounded-full bg-neutral-800 p-4">
						<svg
							class="h-8 w-8 text-neutral-600"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
							/>
						</svg>
					</div>
					<p class="text-sm font-medium text-neutral-400">Your watch list is empty</p>
					<p class="mt-1 max-w-[220px] text-xs text-neutral-600">
						Add movies and shows from their Discover page. They drop off once they're in your
						library.
					</p>
				</div>
			{:else if filteredWatchlist.length === 0}
				<div class="py-8 text-center">
					<p class="text-sm text-neutral-500">No results for "{filterQuery}"</p>
					<button
						type="button"
						onclick={clearFilter}
						class="mt-2 text-xs text-gold-400 transition-colors hover:text-gold-300"
					>
						Clear filter
					</button>
				</div>
			{:else}
				<div class="mb-3 eyebrow text-neutral-600">
					{filteredWatchlist.length} waiting · removed automatically when they arrive
				</div>
				<div class="grid grid-cols-3 gap-2 xl:grid-cols-4">
					{#each filteredWatchlist as item, i (`${item.mediaType}:${item.tmdbId}`)}
						<div
							class="group animate-float-up relative aspect-[2/3] overflow-hidden rounded-md bg-neutral-800"
							style="animation-delay: {Math.min(i, 20) * 30}ms"
						>
							<button
								type="button"
								onclick={() => onOpenTmdb(item.tmdbId, item.mediaType)}
								class="h-full w-full transition-all duration-200 hover:ring-2 hover:ring-white/20 focus:ring-2 focus:ring-gold-500 focus:outline-none"
								title="{item.title}{item.year ? ` (${item.year})` : ''}"
							>
								{#if item.posterPath}
									<img
										src={tmdbImage(item.posterPath, 'w342')}
										alt={item.title}
										loading="lazy"
										class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
									/>
								{:else}
									<div class="flex h-full w-full items-center justify-center p-2">
										<span
											class="line-clamp-3 text-center text-[10px] leading-tight text-neutral-500"
											>{item.title}</span
										>
									</div>
								{/if}
								<div
									class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-2 text-left"
								>
									<p class="truncate text-xs leading-tight font-semibold text-white">
										{item.title}
									</p>
									<p class="mt-0.5 text-[10px] text-neutral-400">
										{item.mediaType === 'movie' ? 'Film' : 'TV'}{item.year ? ` · ${item.year}` : ''}
									</p>
								</div>
							</button>
							<button
								type="button"
								onclick={(e) => removeFromWatchlist(e, item)}
								aria-label="Remove {item.title} from watch list"
								class="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white/80 backdrop-blur-sm transition-all hover:bg-black/80 hover:text-white md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100"
							>
								<svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2.5"
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
							</button>
						</div>
					{/each}
				</div>
			{/if}
		{:else if filterType === 'downloading'}
			{#if filteredDownloads.length === 0}
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<p class="text-sm font-medium text-neutral-400">
						{filterQuery ? `No downloads match "${filterQuery}"` : 'Nothing downloading'}
					</p>
					<p class="mt-1 max-w-[220px] text-xs text-neutral-600">
						Downloads you start from a movie or show page appear here with their progress.
					</p>
				</div>
			{:else}
				<div class="grid grid-cols-3 gap-2 xl:grid-cols-4">
					{#each filteredDownloads as d (d.id)}
						<DownloadTile download={d} onOpen={openDownload(d)} />
					{/each}
				</div>
			{/if}
		{:else}
			{#if filteredDownloads.length > 0}
				<div class="mb-3 eyebrow text-gold-400">Downloading · {filteredDownloads.length}</div>
				<div class="mb-6 grid grid-cols-3 gap-2 xl:grid-cols-4">
					{#each filteredDownloads as d (d.id)}
						<DownloadTile download={d} onOpen={openDownload(d)} />
					{/each}
				</div>
			{/if}
			{#if loading}
				<!-- Skeleton grid -->
				<div class="grid grid-cols-3 gap-2 xl:grid-cols-4">
					{#each Array(SKELETON_COUNT) as _, i}
						<div
							class="shimmer aspect-[2/3] rounded-lg bg-neutral-800"
							style="animation-delay: {i * 40}ms"
						></div>
					{/each}
				</div>
			{:else if error}
				<!-- Error state -->
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<div class="mb-3 rounded-full bg-brick-900/20 p-3">
						<svg
							class="h-6 w-6 text-brick-400"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
					</div>
					<p class="text-sm font-medium text-brick-400">Couldn't load library</p>
					<p class="mt-1 text-xs text-neutral-600">{error}</p>
					<button
						type="button"
						onclick={() => loadLibrary()}
						class="mt-3 text-xs text-gold-400 transition-colors hover:text-gold-300"
					>
						Try again
					</button>
				</div>
			{:else if items.length === 0}
				<!-- Not configured / empty state -->
				<div class="flex flex-col items-center justify-center py-12 text-center">
					<div class="mb-3 rounded-full bg-neutral-800 p-4">
						<svg
							class="h-8 w-8 text-neutral-600"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="1.5"
								d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
							/>
						</svg>
					</div>
					<p class="text-sm font-medium text-neutral-400">No library items</p>
					<p class="mt-1 max-w-[180px] text-xs text-neutral-600">
						Set <code class="text-neutral-500">JELLYFIN_URL</code> to browse your library
					</p>
				</div>
			{:else if filteredItems.length === 0}
				<!-- No filter matches -->
				<div class="py-8 text-center">
					<p class="text-sm text-neutral-500">No results for "{filterQuery}"</p>
					<button
						type="button"
						onclick={clearFilter}
						class="mt-2 text-xs text-gold-400 transition-colors hover:text-gold-300"
					>
						Clear filter
					</button>
				</div>
			{:else}
				<!-- Stats row -->
				<div class="mb-3 flex items-center justify-between eyebrow text-neutral-600">
					<span
						>{filteredDownloads.length > 0 ? 'In library · ' : ''}{filteredItems.length}
						{filteredItems.length === 1 ? 'item' : 'items'}</span
					>
				</div>

				<!-- Poster grid -->
				<div class="grid grid-cols-3 gap-2 xl:grid-cols-4">
					{#each filteredItems as item, i}
						<button
							type="button"
							onclick={() => onSelect(item)}
							class="group animate-float-up relative aspect-[2/3] overflow-hidden rounded-md
							bg-neutral-800 transition-all duration-200 hover:ring-2 hover:ring-white/20
							focus:ring-2 focus:ring-gold-500 focus:outline-none"
							style="animation-delay: {Math.min(i, 20) * 30}ms"
							title="{item.name}{item.year ? ` (${item.year})` : ''}"
						>
							{#if item.hasPoster}
								<!-- Poster image -->
								<img
									src={item.imageUrl}
									alt={item.name}
									loading="lazy"
									class="h-full w-full object-cover transition-transform duration-300
									group-hover:scale-105"
								/>
							{:else}
								<!-- Placeholder when no poster -->
								<div class="flex h-full w-full flex-col items-center justify-center gap-2 p-2">
									{#if item.type === 'Movie'}
										<svg
											class="h-8 w-8 text-neutral-600"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="1.5"
												d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4"
											/>
										</svg>
									{:else}
										<svg
											class="h-8 w-8 text-neutral-600"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="1.5"
												d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
											/>
										</svg>
									{/if}
									<span class="line-clamp-3 text-center text-[10px] leading-tight text-neutral-500">
										{item.name}
									</span>
								</div>
							{/if}

							<!-- Hover overlay -->
							<div
								class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t
								from-black/90 via-black/40 to-transparent p-2 opacity-0
								transition-opacity duration-200 group-hover:opacity-100"
							>
								<p class="truncate text-xs leading-tight font-semibold text-white">{item.name}</p>
								{#if item.year}
									<p class="mt-0.5 text-[10px] text-neutral-400">{item.year}</p>
								{/if}
							</div>

							<!-- Type badge (top right) -->
							<div
								class="pointer-events-none absolute top-1.5 right-1.5 opacity-0
								transition-opacity duration-200 group-hover:opacity-100"
							>
								<span
									class="rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase
									{item.type === 'Movie' ? 'bg-gold-500/80 text-white' : 'bg-tide-500/80 text-white'}"
								>
									{item.type === 'Movie' ? 'Film' : 'TV'}
								</span>
							</div>
						</button>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</div>
