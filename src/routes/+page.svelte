<script lang="ts">
	import TorrentSidebar from '$lib/components/TorrentSidebar.svelte';
	import MobileTabBar, { type MobileTab } from '$lib/components/MobileTabBar.svelte';
	import DiscoverView from '$lib/components/discover/DiscoverView.svelte';
	import LibraryPanel from '$lib/components/LibraryPanel.svelte';
	import type { SearchResult, DownloadJob, DownloadMeta, JellyfinItem } from '$lib/types';
	import { libraryFocus, refreshDownloads } from '$lib/stores/downloads';
	import { mediaTypeFromCategory } from '$lib/types';
	import { toasts } from '$lib/stores/toasts';
	import { onMount } from 'svelte';

	// Track downloading torrent IDs (to prevent duplicate downloads)
	let downloadingIds = $state<Set<number>>(new Set());

	// Jobs still being fetched from TorrentLeech / in early stages before qBittorrent picks them up
	let fetchingJobs = $state<DownloadJob[]>([]);

	// Sidebar ref for triggering refresh (mobile overlay only)
	let sidebarRef: TorrentSidebar | undefined = $state();

	// Pending library item to open in DiscoverView
	let pendingLibraryItem = $state<{ tmdbId: number; mediaType: 'movie' | 'tv' } | null>(null);

	function openTmdb(tmdbId: number, mediaType: 'movie' | 'tv') {
		mobileTab = 'discover';
		pendingLibraryItem = { tmdbId, mediaType };
	}

	function handleLibrarySelect(item: JellyfinItem) {
		if (!item.tmdbId) return;
		openTmdb(Number(item.tmdbId), item.type === 'Movie' ? 'movie' : 'tv');
	}

	// Downloading count from sidebar (for mobile badge & header indicator)
	let downloadingCount = $state(0);

	// Mobile state
	let isMobile = $state(false);
	let mobileTab = $state<MobileTab>('discover');
	let previousMobileTab = $state<MobileTab>('discover');

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
	}

	// Compute slide direction for tab transitions
	const tabOrder: MobileTab[] = ['discover', 'library', 'downloads'];
	const tabSlideClass = $derived.by(() => {
		const prevIndex = tabOrder.indexOf(previousMobileTab);
		const currIndex = tabOrder.indexOf(mobileTab);
		return currIndex > prevIndex ? 'tab-slide-left' : 'tab-slide-right';
	});

	async function handleDownload(result: SearchResult, meta?: DownloadMeta) {
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

		// Show it in the matching library tab (and open the library on mobile)
		libraryFocus.set({
			tab: (meta?.mediaType ?? mediaType) === 'tv' ? 'tvshows' : 'movies',
			at: Date.now()
		});
		if (isMobile && mobileTab !== 'library') {
			handleMobileTabChange('library');
		}

		try {
			const response = await fetch('/api/download', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					torrentId: result.id,
					filename: result.filename,
					title: result.title,
					mediaType,
					meta
				})
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to start download');
			}

			const jobId = data.jobId;
			toasts.success(`Started downloading: ${result.title}`);

			// Tell sidebar and library to refresh immediately
			sidebarRef?.refresh();
			refreshDownloads();

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
					refreshDownloads();
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
</script>

<div class="flex h-full w-full">
	<!-- Main content area -->
	<div class="relative flex flex-1 flex-col overflow-hidden border-neutral-800 md:border-r">
		<!-- Desktop: always show content -->
		<!-- Mobile: show content based on tab -->
		{#if !isMobile || mobileTab === 'discover'}
			<div class="flex flex-1 flex-col overflow-hidden">
				<!-- ═══════════════════════════════════════════════════════════ -->
				<!-- TOP HEADER WITH VIEW TOGGLE                                 -->
				<!-- ═══════════════════════════════════════════════════════════ -->
				<div class="flex-shrink-0 px-4 pt-4 sm:px-6 sm:pt-6">
					<div class="mb-0 flex items-center justify-between gap-4">
						<!-- Wordmark (desktop; on mobile the tab bar handles navigation) -->
						<a
							href="/"
							class="hidden font-display text-2xl leading-none tracking-tight text-white md:block"
						>
							tv<span class="text-gold-400">/</span>thing
						</a>

						<!-- Mobile title -->
						<h1 class="font-display text-3xl text-white md:hidden">Discover</h1>
					</div>
				</div>

				<!-- ═══════════════════════════════════════════════════════════ -->
				<!-- VIEW CONTENT                                                -->
				<!-- ═══════════════════════════════════════════════════════════ -->

				<div class="flex-1 overflow-hidden">
					<DiscoverView
						onDownload={handleDownload}
						{downloadingIds}
						pendingOpen={pendingLibraryItem}
						onPendingOpenConsumed={() => (pendingLibraryItem = null)}
					/>
				</div>
			</div>
		{/if}

		<!-- Mobile-only: Library tab -->
		{#if isMobile && mobileTab === 'library'}
			{#key mobileTab}
				<div class="absolute inset-0 flex flex-col bg-neutral-900 {tabSlideClass}">
					<div class="flex-1 overflow-hidden pb-20">
						<LibraryPanel onSelect={handleLibrarySelect} onOpenTmdb={openTmdb} />
					</div>
				</div>
			{/key}
		{/if}

		<!-- Mobile-only: Downloads tab -->
		{#if isMobile && mobileTab === 'downloads'}
			{#key mobileTab}
				<div class="absolute inset-0 flex flex-col bg-neutral-900 {tabSlideClass}">
					<div class="animate-fade-in px-4 py-6">
						<h1 class="font-display text-3xl text-white">Downloads</h1>
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
		<LibraryPanel onSelect={handleLibrarySelect} onOpenTmdb={openTmdb} />
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
