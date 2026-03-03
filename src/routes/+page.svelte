<script lang="ts">
	import ResultsGrid from '$lib/components/ResultsGrid.svelte';
	import TorrentSidebar from '$lib/components/TorrentSidebar.svelte';
	import MobileTabBar, { type MobileTab } from '$lib/components/MobileTabBar.svelte';
	import DownloadsModal from '$lib/components/DownloadsModal.svelte';
	import DownloadsHeaderIndicator from '$lib/components/DownloadsHeaderIndicator.svelte';
	import DiscoverView from '$lib/components/discover/DiscoverView.svelte';
	import LibraryPanel from '$lib/components/LibraryPanel.svelte';
	import type { SearchResult, SearchCategory, DownloadJob, JellyfinItem } from '$lib/types';
	import { CATEGORY_LABELS, mediaTypeFromCategory } from '$lib/types';
	import { toasts } from '$lib/stores/toasts';
	import { onMount } from 'svelte';

	// ─── Top-level view state ─────────────────────────────────────────────────
	type MainView = 'search' | 'discover';
	let activeView = $state<MainView>('discover');

	// Search state
	let searchQuery: string = $state('');
	let searchCategory: SearchCategory = $state('tv-episodes');
	let results: SearchResult[] = $state([]);
	let totalResults: number = $state(0);
	let loading = $state(false);
	let hasSearched = $state(false);
	let error = $state<string | null>(null);

	// Track downloading torrent IDs (to prevent duplicate downloads)
	let downloadingIds = $state<Set<number>>(new Set());

	// Jobs still being fetched from TorrentLeech / in early stages before qBittorrent picks them up
	let fetchingJobs = $state<DownloadJob[]>([]);

	// Sidebar ref for triggering refresh (mobile overlay only)
	let sidebarRef: TorrentSidebar | undefined = $state();

	// Pending library item to open in DiscoverView
	let pendingLibraryItem = $state<{ tmdbId: number; mediaType: 'movie' | 'tv' } | null>(null);

	function handleLibrarySelect(item: JellyfinItem) {
		if (!item.tmdbId) return;
		activeView = 'discover';
		mobileTab = 'discover';
		pendingLibraryItem = {
			tmdbId: Number(item.tmdbId),
			mediaType: item.type === 'Movie' ? 'movie' : 'tv'
		};
	}

	// Downloading count from sidebar (for mobile badge & header indicator)
	let downloadingCount = $state(0);

	// Mobile state
	let isMobile = $state(false);
	let mobileTab = $state<MobileTab>('discover');
	let previousMobileTab = $state<MobileTab>('discover');

	// Resolved view for both mobile and desktop
	const currentView = $derived(
		isMobile ? (mobileTab === 'discover' ? 'discover' : 'search') : activeView
	);

	// Downloads modal state
	let isDownloadsModalOpen = $state(false);

	function openDownloadsModal() {
		isDownloadsModalOpen = true;
	}

	function closeDownloadsModal() {
		isDownloadsModalOpen = false;
	}

	onMount(() => {
		const mediaQuery = window.matchMedia('(max-width: 767px)');
		isMobile = mediaQuery.matches;

		const handleResize = (e: MediaQueryListEvent) => {
			isMobile = e.matches;
		};

		mediaQuery.addEventListener('change', handleResize);
		return () => mediaQuery.removeEventListener('change', handleResize);
	});

	// Mobile tab management
	function handleMobileTabChange(tab: MobileTab) {
		previousMobileTab = mobileTab;
		mobileTab = tab;
		// Sync view state with tab
		if (tab === 'search') activeView = 'search';
		if (tab === 'discover') activeView = 'discover';
	}

	// Compute slide direction for tab transitions
	const tabOrder: MobileTab[] = ['search', 'discover', 'downloads'];
	const tabSlideClass = $derived.by(() => {
		const prevIndex = tabOrder.indexOf(previousMobileTab);
		const currIndex = tabOrder.indexOf(mobileTab);
		return currIndex > prevIndex ? 'tab-slide-left' : 'tab-slide-right';
	});

	// Sync desktop view toggle with mobile tabs
	function setActiveView(view: MainView) {
		activeView = view;
		if (isMobile) {
			handleMobileTabChange(view);
		}
	}

	function handleCategoryChange(category: SearchCategory) {
		searchCategory = category;
		if (searchQuery.trim() && hasSearched) {
			performSearch(searchQuery.trim(), category);
		}
	}

	async function performSearch(query: string, category: SearchCategory) {
		loading = true;
		error = null;
		hasSearched = true;

		try {
			const params = new URLSearchParams({
				q: query,
				category,
				sort: 'seeders',
				order: 'desc'
			});
			const response = await fetch(`/api/search?${params}`);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Search failed');
			}

			results = data.results;
			totalResults = data.total;
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Search failed';
			error = message;
			toasts.error(message);
			results = [];
			totalResults = 0;
		} finally {
			loading = false;
		}
	}

	function handleSearch() {
		if (searchQuery.trim()) {
			performSearch(searchQuery.trim(), searchCategory);
		}
	}

	function clearSearch() {
		searchQuery = '';
		hasSearched = false;
		results = [];
		totalResults = 0;
		error = null;
	}

	async function handleDownload(result: SearchResult) {
		if (downloadingIds.has(result.id)) {
			toasts.warning('Already downloading this torrent');
			return;
		}

		downloadingIds = new Set([...downloadingIds, result.id]);

		const mediaType = mediaTypeFromCategory(result.category);

		// Create an initial fetching job for the sidebar to show immediately
		const tempJob: DownloadJob = {
			id: `fetching-${result.id}`,
			torrentId: result.id,
			title: result.title,
			mediaType,
			status: 'fetching',
			progress: 0,
			downloadSpeed: 0,
			uploadSpeed: 0,
			numPeers: 0
		};
		fetchingJobs = [...fetchingJobs, tempJob];

		// Auto-switch to downloads tab on mobile when download starts
		if (isMobile && mobileTab !== 'downloads') {
			handleMobileTabChange('downloads');
		}

		try {
			const response = await fetch('/api/download', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					torrentId: result.id,
					filename: result.filename,
					title: result.title,
					mediaType
				})
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to start download');
			}

			const jobId = data.jobId;
			toasts.success(`Started downloading: ${result.title}`);

			// Tell sidebar to refresh immediately
			sidebarRef?.refresh();

			const eventSource = new EventSource(`/api/progress/${jobId}`);

			eventSource.onmessage = (event) => {
				const payload = JSON.parse(event.data);

				if (payload.type === 'progress') {
					const job = payload as DownloadJob;
					if (job.status === 'downloading' || job.status === 'complete') {
						fetchingJobs = fetchingJobs.filter((j) => j.torrentId !== result.id);
						sidebarRef?.refresh();
					}
				} else if (payload.type === 'done') {
					const job = payload as { status: string; error?: string };
					if (job.status === 'complete') {
						toasts.success(`Download complete: ${result.title}`);
					} else if (job.status === 'error') {
						toasts.error(`Download failed: ${job.error || 'Unknown error'}`);
					}

					eventSource.close();
					downloadingIds = new Set([...downloadingIds].filter((id) => id !== result.id));
					fetchingJobs = fetchingJobs.filter((j) => j.torrentId !== result.id);

					setTimeout(() => {
						sidebarRef?.refresh();
					}, 2000);
				}
			};

			eventSource.onerror = () => {
				eventSource.close();
				downloadingIds = new Set([...downloadingIds].filter((id) => id !== result.id));
				fetchingJobs = fetchingJobs.filter((j) => j.torrentId !== result.id);
			};
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Failed to start download';
			toasts.error(message);
			downloadingIds = new Set([...downloadingIds].filter((id) => id !== result.id));
			fetchingJobs = fetchingJobs.filter((j) => j.torrentId !== result.id);
		}
	}

	// Total active download count
	const totalDownloadingCount = $derived(downloadingCount);

	// Category options for tabs
	const categories: SearchCategory[] = ['tv-episodes', 'tv-boxsets', 'movies', 'documentaries'];
</script>

<div class="flex h-full w-full">
	<!-- Main content area -->
	<div class="relative flex flex-1 flex-col overflow-hidden border-neutral-800 md:border-r">
		<!-- Desktop: always show content -->
		<!-- Mobile: show content based on tab -->
		{#if !isMobile || mobileTab === 'search' || mobileTab === 'discover'}
			<div class="flex flex-1 flex-col overflow-hidden">
				<!-- ═══════════════════════════════════════════════════════════ -->
				<!-- TOP HEADER WITH VIEW TOGGLE                                 -->
				<!-- ═══════════════════════════════════════════════════════════ -->
				<div class="flex-shrink-0 px-4 pt-4 sm:px-6 sm:pt-6">
					<div class="mb-0 flex items-center justify-between gap-4">
						<!-- View toggle (only on desktop; on mobile, the tab bar handles it) -->
						<div
							class="hidden items-center gap-1 rounded-xl bg-white/[0.03] p-1
							ring-1 ring-white/[0.06] md:flex"
						>
							<button
								type="button"
								onclick={() => setActiveView('discover')}
								class="relative rounded-lg px-4 py-1.5 text-sm font-medium transition-all duration-300
									{activeView === 'discover' ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'}"
							>
								{#if activeView === 'discover'}
									<div
										class="absolute inset-0 rounded-lg bg-gradient-to-r from-violet-500/15 to-blue-500/15
										shadow-sm ring-1 ring-white/[0.08]"
									></div>
								{/if}
								<span class="relative flex items-center gap-2">
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
										/>
									</svg>
									Discover
								</span>
							</button>
							<button
								type="button"
								onclick={() => setActiveView('search')}
								class="relative rounded-lg px-4 py-1.5 text-sm font-medium transition-all duration-300
									{activeView === 'search' ? 'text-white' : 'text-neutral-500 hover:text-neutral-300'}"
							>
								{#if activeView === 'search'}
									<div
										class="absolute inset-0 rounded-lg bg-white/[0.06]
										shadow-sm ring-1 ring-white/[0.08]"
									></div>
								{/if}
								<span class="relative flex items-center gap-2">
									<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
										/>
									</svg>
									Torrents
								</span>
							</button>
						</div>

						<!-- Mobile title -->
						<h1 class="text-2xl font-bold text-white md:hidden">
							{#if mobileTab === 'discover'}
								Discover
							{:else}
								Search
							{/if}
						</h1>

						<!-- Desktop-only: downloads indicator -->
						<div class="hidden md:block">
							<DownloadsHeaderIndicator
								onClick={openDownloadsModal}
								downloadingCount={totalDownloadingCount}
								{fetchingJobs}
							/>
						</div>
					</div>
				</div>

				<!-- ═══════════════════════════════════════════════════════════ -->
				<!-- VIEW CONTENT                                                -->
				<!-- ═══════════════════════════════════════════════════════════ -->

				{#if currentView === 'discover'}
					<!-- ─── DISCOVER VIEW ─────────────────────────────────── -->
					<div class="flex-1 overflow-hidden">
						<DiscoverView
							onDownload={handleDownload}
							{downloadingIds}
							pendingOpen={pendingLibraryItem}
							onPendingOpenConsumed={() => (pendingLibraryItem = null)}
						/>
					</div>
				{:else}
					<!-- ─── SEARCH VIEW (existing TorrentLeech search) ──── -->
					<div class="flex flex-1 flex-col overflow-hidden">
						<!-- Category tabs + search input -->
						<div class="flex-shrink-0 px-4 pt-3 pb-4 sm:px-6">
							<!-- Category tabs -->
							<div class="mb-4 flex gap-1.5 overflow-x-auto">
								{#each categories as cat}
									<button
										type="button"
										onclick={() => handleCategoryChange(cat)}
										class="rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-all sm:px-4 sm:text-sm {searchCategory ===
										cat
											? 'bg-white text-black'
											: 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'}"
									>
										{CATEGORY_LABELS[cat]}
									</button>
								{/each}
							</div>

							<div class="relative">
								<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
									{#if loading}
										<svg
											class="h-5 w-5 animate-spin text-neutral-400"
											viewBox="0 0 24 24"
											fill="none"
										>
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
												d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
											/>
										</svg>
									{/if}
								</div>

								<input
									type="text"
									bind:value={searchQuery}
									onkeydown={(e) => {
										if (e.key === 'Enter') handleSearch();
									}}
									placeholder="Search {CATEGORY_LABELS[searchCategory].toLowerCase()}..."
									class="w-full rounded-full border-0 bg-neutral-800 py-3 pl-12 text-white placeholder-neutral-500 ring-1 ring-neutral-700 transition-all focus:bg-neutral-750 focus:ring-2 focus:ring-blue-500 focus:outline-none {searchQuery
										? 'pr-10'
										: 'pr-4'}"
									disabled={loading}
								/>

								{#if searchQuery}
									<button
										type="button"
										onclick={clearSearch}
										class="absolute inset-y-0 right-0 flex items-center pr-3 text-neutral-400 transition-colors hover:text-white"
										aria-label="Clear search"
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
						</div>

						<!-- Results area -->
						<div class="min-h-0 flex-1 overflow-y-auto px-4 pb-20 sm:px-6 md:pb-8">
							{#if error}
								<div class="flex flex-col items-center justify-center py-12 text-center">
									<div class="mb-4 rounded-full bg-red-900/30 p-4">
										<svg
											class="h-8 w-8 text-red-400"
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
									<p class="text-lg font-medium text-red-400">{error}</p>
								</div>
							{:else if loading}
								<div class="flex flex-col items-center justify-center py-16">
									<svg
										class="h-10 w-10 animate-spin text-neutral-500"
										viewBox="0 0 24 24"
										fill="none"
									>
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
									<p class="mt-4 text-neutral-500">Searching...</p>
								</div>
							{:else if hasSearched}
								<ResultsGrid
									{results}
									total={totalResults}
									onDownload={handleDownload}
									{downloadingIds}
								/>
							{:else}
								<div class="flex flex-col items-center justify-center py-16 text-center">
									<svg
										class="mb-4 h-20 w-20 text-neutral-800"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="1"
											d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
										/>
									</svg>
									<p class="text-lg font-medium text-neutral-400">Find your media</p>
									<p class="mt-1 text-sm text-neutral-500">Search for TV shows, movies, and more</p>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Mobile-only: Downloads tab -->
		{#if isMobile && mobileTab === 'downloads'}
			{#key mobileTab}
				<div class="absolute inset-0 flex flex-col bg-neutral-900 {tabSlideClass}">
					<div class="animate-fade-in px-4 py-6">
						<h1 class="text-2xl font-bold text-white sm:text-3xl">Downloads</h1>
					</div>
					<div class="flex-1 overflow-hidden px-4 pb-20">
						<TorrentSidebar
							bind:this={sidebarRef}
							{fetchingJobs}
							onCountChange={(count) => (downloadingCount = count)}
						/>
					</div>
				</div>
			{/key}
		{/if}
	</div>

	<!-- Side Panel (right side on desktop, hidden on mobile) — Library -->
	<div class="hidden flex-col md:flex md:w-1/3">
		<LibraryPanel onSelect={handleLibrarySelect} />
	</div>
</div>

<!-- Mobile Tab Bar -->
{#if isMobile}
	<MobileTabBar
		activeTab={mobileTab}
		activeDownloadCount={totalDownloadingCount + fetchingJobs.length}
		onTabChange={handleMobileTabChange}
	/>
{/if}

<!-- Downloads Modal (desktop drawer) -->
<DownloadsModal
	isOpen={isDownloadsModalOpen}
	onClose={closeDownloadsModal}
	{fetchingJobs}
	onCountChange={(count) => (downloadingCount = count)}
/>
