<script lang="ts">
	/**
	 * Library panel — shows the user's Jellyfin media library as a poster grid.
	 * Mirrors the book-thing library panel style.
	 * Clicking an item calls onSelect so the parent can navigate to its detail page.
	 */
	import type { JellyfinItem } from '$lib/types';
	import { onMount } from 'svelte';

	interface Props {
		onSelect: (item: JellyfinItem) => void;
	}

	let { onSelect }: Props = $props();

	type FilterType = 'all' | 'movies' | 'tvshows';

	let items = $state<JellyfinItem[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let filterType = $state<FilterType>('all');
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

	const movieCount = $derived(items.filter((i) => i.type === 'Movie').length);
	const tvCount = $derived(items.filter((i) => i.type === 'Series').length);

	async function loadLibrary() {
		loading = true;
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

	function clearFilter() {
		filterQuery = '';
		filterInput?.focus();
	}

	onMount(() => {
		loadLibrary();
	});

	// Skeleton count for loading state
	const SKELETON_COUNT = 12;
</script>

<div class="flex h-full flex-col">
	<!-- ── Header ─────────────────────────────────────────────────── -->
	<div class="flex-shrink-0 border-b border-neutral-800 px-4 pt-4 pb-4 sm:px-6">
		<div class="mb-3 flex h-9 items-center justify-between">
			<h2 class="text-lg font-bold text-white">Library</h2>
			<button
				type="button"
				onclick={loadLibrary}
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

		<!-- Filter type tabs -->
		<div class="mb-4 flex gap-1.5 overflow-x-auto">
			{#each [['all', 'All'], ['movies', 'Movies'], ['tvshows', 'TV Shows']] as const as [val, label]}
				<button
					type="button"
					onclick={() => (filterType = val)}
					class="rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all sm:px-4 sm:text-sm
						{filterType === val
						? 'bg-white text-black'
						: 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'}"
				>
					{label}{#if val === 'movies' && movieCount > 0}<span class="ml-1 opacity-50"
							>{movieCount}</span
						>{:else if val === 'tvshows' && tvCount > 0}<span class="ml-1 opacity-50"
							>{tvCount}</span
						>{/if}
				</button>
			{/each}
		</div>

		<!-- Filter input -->
		{#if items.length > 0}
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
					class="w-full rounded-full border-0 bg-neutral-800 py-3 pl-12 text-white
						placeholder-neutral-500 ring-1 ring-neutral-700 transition-all
						focus:bg-neutral-750 focus:ring-2 focus:ring-blue-500 focus:outline-none {filterQuery
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
				<p class="text-sm font-medium text-red-400">Couldn't load library</p>
				<p class="mt-1 text-xs text-neutral-600">{error}</p>
				<button
					type="button"
					onclick={loadLibrary}
					class="mt-3 text-xs text-blue-400 transition-colors hover:text-blue-300"
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
					class="mt-2 text-xs text-blue-400 transition-colors hover:text-blue-300"
				>
					Clear filter
				</button>
			</div>
		{:else}
			<!-- Stats row -->
			<div class="mb-3 flex items-center justify-between text-xs text-neutral-600">
				<span>{filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}</span>
			</div>

			<!-- Poster grid -->
			<div class="grid grid-cols-3 gap-2 xl:grid-cols-4">
				{#each filteredItems as item, i}
					<button
						type="button"
						onclick={() => onSelect(item)}
						class="group animate-float-up relative aspect-[2/3] overflow-hidden rounded-lg
							bg-neutral-800 transition-all duration-200 hover:ring-2 hover:ring-white/20
							focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
									{item.type === 'Movie' ? 'bg-blue-500/80 text-white' : 'bg-violet-500/80 text-white'}"
							>
								{item.type === 'Movie' ? 'Film' : 'TV'}
							</span>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>
