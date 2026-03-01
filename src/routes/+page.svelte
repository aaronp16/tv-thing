<script lang="ts">
	import ResultsGrid from '$lib/components/ResultsGrid.svelte';
	import TorrentSidebar from '$lib/components/TorrentSidebar.svelte';
	import type { BookResult, SearchField, DownloadJob, LibraryFile } from '$lib/types';
	import { toasts } from '$lib/stores/toasts';

	// Current view (mobile tabs): 'search', 'library', or 'torrents'
	let currentView: 'search' | 'library' | 'torrents' = $state('search');

	// Search state
	let searchField: SearchField = $state('title');
	let searchQuery: string = $state('');
	let books: BookResult[] = $state([]);
	let totalResults: number = $state(0);
	let loading = $state(false);
	let hasSearched = $state(false);
	let error = $state<string | null>(null);

	// Library state
	let libraryFiles: LibraryFile[] = $state([]);
	let libraryTotalSize: string = $state('0 B');
	let libraryLoading = $state(false);

	// Track downloading book IDs (to prevent duplicate downloads)
	let downloadingIds = $state<Set<number>>(new Set());

	// Jobs still being fetched from MAM / in early stages before qBittorrent picks them up
	let fetchingJobs = $state<DownloadJob[]>([]);

	// Sidebar ref for triggering refresh
	let sidebarRef: TorrentSidebar | undefined = $state();

	// Downloading count from sidebar (for mobile badge)
	let downloadingCount = $state(0);

	async function performSearch(query: string, field: SearchField) {
		loading = true;
		error = null;
		hasSearched = true;

		try {
			const response = await fetch(
				`/api/search?q=${encodeURIComponent(query)}&field=${field}`
			);
			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Search failed');
			}

			books = data.results;
			totalResults = data.total;
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Search failed';
			error = message;
			toasts.error(message);
			books = [];
			totalResults = 0;
		} finally {
			loading = false;
		}
	}

	function handleSearch() {
		if (searchQuery.trim()) {
			performSearch(searchQuery.trim(), searchField);
		}
	}

	function handleFieldChange(field: SearchField) {
		searchField = field;
		if (searchQuery.trim() && hasSearched) {
			performSearch(searchQuery.trim(), field);
		}
	}

	function clearSearch() {
		searchQuery = '';
		hasSearched = false;
		books = [];
		totalResults = 0;
		error = null;
	}

	async function handleDownload(book: BookResult) {
		if (downloadingIds.has(book.id)) {
			toasts.warning('Already downloading this book');
			return;
		}

		downloadingIds = new Set([...downloadingIds, book.id]);

		// Create an initial fetching job for the sidebar to show immediately
		const tempJob: DownloadJob = {
			id: `fetching-${book.id}`,
			mamId: book.id,
			title: book.title,
			status: 'fetching',
			progress: 0,
			downloadSpeed: 0,
			uploadSpeed: 0,
			numPeers: 0
		};
		fetchingJobs = [...fetchingJobs, tempJob];

		try {
			const response = await fetch('/api/download', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mamId: book.id, title: book.title })
			});

			const data = await response.json();

			if (!response.ok) {
				throw new Error(data.error || 'Failed to start download');
			}

			const jobId = data.jobId;
			toasts.success(`Started downloading: ${book.title}`);

			// Tell sidebar to refresh immediately
			sidebarRef?.refresh();

			const eventSource = new EventSource(`/api/progress/${jobId}`);

			eventSource.onmessage = (event) => {
				const payload = JSON.parse(event.data);

				if (payload.type === 'progress') {
					const job = payload as DownloadJob;
					// Update the fetching job with real data
					if (job.status === 'downloading' || job.status === 'complete') {
						// Remove from fetchingJobs — qBittorrent has it now, sidebar will pick it up
						fetchingJobs = fetchingJobs.filter((j) => j.mamId !== book.id);
						sidebarRef?.refresh();
					}
				} else if (payload.type === 'done') {
					const job = payload as { status: string; error?: string };
					if (job.status === 'complete') {
						toasts.success(`Download complete: ${book.title}`);
					} else if (job.status === 'error') {
						toasts.error(`Download failed: ${job.error || 'Unknown error'}`);
					}

					eventSource.close();
					downloadingIds = new Set([...downloadingIds].filter((id) => id !== book.id));
					fetchingJobs = fetchingJobs.filter((j) => j.mamId !== book.id);

					// Refresh sidebar and library after a short delay
					setTimeout(() => {
						sidebarRef?.refresh();
						if (currentView === 'library') {
							loadLibrary();
						}
					}, 2000);
				}
			};

			eventSource.onerror = () => {
				eventSource.close();
				downloadingIds = new Set([...downloadingIds].filter((id) => id !== book.id));
				fetchingJobs = fetchingJobs.filter((j) => j.mamId !== book.id);
			};
		} catch (e) {
			const message = e instanceof Error ? e.message : 'Failed to start download';
			toasts.error(message);
			downloadingIds = new Set([...downloadingIds].filter((id) => id !== book.id));
			fetchingJobs = fetchingJobs.filter((j) => j.mamId !== book.id);
		}
	}

	async function loadLibrary() {
		libraryLoading = true;
		try {
			const response = await fetch('/api/library');
			const data = await response.json();
			if (response.ok) {
				libraryFiles = data.files || [];
				libraryTotalSize = data.totalSizeFormatted || '0 B';
			}
		} catch {
			toasts.error('Failed to load library');
		} finally {
			libraryLoading = false;
		}
	}

	function switchView(view: 'search' | 'library' | 'torrents') {
		currentView = view;
		if (view === 'library') {
			loadLibrary();
		}
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
	}

	function formatDate(isoString: string): string {
		const date = new Date(isoString);
		return date.toLocaleDateString(undefined, {
			month: 'short',
			day: 'numeric',
			year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
		});
	}

	function getFileIcon(ext: string): string {
		const icons: Record<string, string> = {
			epub: 'E',
			pdf: 'P',
			mobi: 'M',
			azw: 'A',
			azw3: 'A',
			cbz: 'C',
			cbr: 'C'
		};
		return icons[ext] || 'B';
	}
</script>

<div class="flex h-full w-full">
	<!-- Main Content Area -->
	<div class="relative flex min-w-0 flex-1 flex-col overflow-hidden {currentView === 'torrents' ? 'hidden lg:flex' : 'flex'}">
		<!-- Tab Navigation (desktop: Search + Library only, mobile tabs are at the bottom) -->
		<div class="flex border-b border-neutral-800 px-4 sm:px-6 lg:flex">
			<button
				type="button"
				onclick={() => switchView('search')}
				class="relative px-4 py-3 text-sm font-medium transition-colors {currentView === 'search'
					? 'text-white'
					: 'text-neutral-400 hover:text-neutral-200'}"
			>
				Search
				{#if currentView === 'search'}
					<span class="absolute bottom-0 left-0 right-0 h-0.5 bg-white"></span>
				{/if}
			</button>
			<button
				type="button"
				onclick={() => switchView('library')}
				class="relative px-4 py-3 text-sm font-medium transition-colors {currentView === 'library'
					? 'text-white'
					: 'text-neutral-400 hover:text-neutral-200'}"
			>
				Library
				{#if libraryFiles.length > 0}
					<span class="ml-1.5 rounded-full bg-neutral-700 px-1.5 py-0.5 text-xs text-neutral-300">
						{libraryFiles.length}
					</span>
				{/if}
				{#if currentView === 'library'}
					<span class="absolute bottom-0 left-0 right-0 h-0.5 bg-white"></span>
				{/if}
			</button>
		</div>

		<!-- Content Area -->
		<div class="flex flex-1 flex-col overflow-hidden">
			{#if currentView === 'search' || (currentView !== 'library' && currentView !== 'torrents')}
				<!-- Search View -->
				<div class="animate-fade-in px-4 py-6 sm:px-6 sm:py-8">
					<div class="mb-4 flex items-center justify-between gap-4 sm:mb-6">
						<h1 class="text-2xl font-bold text-white sm:text-3xl">Search</h1>
						<div class="flex gap-2">
							<button
								type="button"
								onclick={() => handleFieldChange('title')}
								class="rounded-full px-3 py-1.5 text-xs font-medium transition-all sm:px-4 sm:text-sm {searchField === 'title'
									? 'bg-white text-black'
									: 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'}"
							>
								Title
							</button>
							<button
								type="button"
								onclick={() => handleFieldChange('author')}
								class="rounded-full px-3 py-1.5 text-xs font-medium transition-all sm:px-4 sm:text-sm {searchField === 'author'
									? 'bg-white text-black'
									: 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white'}"
							>
								Author
							</button>
						</div>
					</div>

					<div class="relative">
						<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
							{#if loading}
								<svg class="h-5 w-5 animate-spin text-neutral-400" viewBox="0 0 24 24" fill="none">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
							{:else}
								<svg class="h-5 w-5 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
								</svg>
							{/if}
						</div>
						<input
							type="text"
							bind:value={searchQuery}
							onkeydown={(e) => { if (e.key === 'Enter') handleSearch(); }}
							placeholder={searchField === 'title' ? 'Search by book title...' : 'Search by author name...'}
							class="w-full rounded-full border-0 bg-neutral-800 py-3 pr-12 pl-12 text-white placeholder-neutral-500 ring-1 ring-neutral-700 transition-all focus:bg-neutral-750 focus:ring-2 focus:ring-blue-500 focus:outline-none"
							disabled={loading}
						/>
						{#if searchQuery}
							<button
								type="button"
								onclick={clearSearch}
								class="absolute inset-y-0 right-0 flex items-center pr-4 text-neutral-400 transition-colors hover:text-white"
								aria-label="Clear search"
							>
								<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
								</svg>
							</button>
						{/if}
					</div>
				</div>

				<div class="min-h-0 flex-1 overflow-y-auto px-4 pb-20 sm:px-6 lg:pb-8">
					{#if error}
						<div class="flex flex-col items-center justify-center py-12 text-center">
							<div class="mb-4 rounded-full bg-red-900/30 p-4">
								<svg class="h-8 w-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
								</svg>
							</div>
							<p class="text-lg font-medium text-red-400">{error}</p>
						</div>
					{:else if loading}
						<div class="flex flex-col items-center justify-center py-16">
							<svg class="h-10 w-10 animate-spin text-neutral-500" viewBox="0 0 24 24" fill="none">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							<p class="mt-4 text-neutral-500">Searching...</p>
						</div>
					{:else if hasSearched}
						<ResultsGrid {books} total={totalResults} onDownload={handleDownload} {downloadingIds} />
					{:else}
						<div class="flex flex-col items-center justify-center py-16 text-center">
							<svg class="mb-4 h-20 w-20 text-neutral-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
							</svg>
							<p class="text-lg font-medium text-neutral-400">Find your books</p>
							<p class="mt-1 text-sm text-neutral-500">Search by title or author</p>
						</div>
					{/if}
				</div>
			{:else if currentView === 'library'}
				<!-- Library View -->
				<div class="animate-fade-in px-4 py-6 sm:px-6 sm:py-8">
					<div class="flex items-center justify-between gap-4">
						<div>
							<h1 class="text-2xl font-bold text-white sm:text-3xl">Library</h1>
							<p class="mt-1 text-sm text-neutral-500">
								{libraryFiles.length} books &middot; {libraryTotalSize}
							</p>
						</div>
						<button
							type="button"
							onclick={() => loadLibrary()}
							disabled={libraryLoading}
							class="rounded-full bg-neutral-800 p-2 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white disabled:opacity-50"
							aria-label="Refresh library"
						>
							<svg class="h-5 w-5 {libraryLoading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
							</svg>
						</button>
					</div>
				</div>

				<div class="min-h-0 flex-1 overflow-y-auto px-4 pb-20 sm:px-6 lg:pb-8">
					{#if libraryLoading && libraryFiles.length === 0}
						<div class="flex flex-col items-center justify-center py-16">
							<svg class="h-10 w-10 animate-spin text-neutral-500" viewBox="0 0 24 24" fill="none">
								<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
								<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
							</svg>
							<p class="mt-4 text-neutral-500">Loading library...</p>
						</div>
					{:else if libraryFiles.length === 0}
						<div class="flex flex-col items-center justify-center py-16 text-center">
							<svg class="mb-4 h-20 w-20 text-neutral-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
							</svg>
							<p class="text-lg font-medium text-neutral-400">No books yet</p>
							<p class="mt-1 text-sm text-neutral-500">Downloaded books will appear here</p>
						</div>
					{:else}
						<div class="space-y-1">
							{#each libraryFiles as file (file.path)}
								<div class="group flex items-center gap-3 rounded-lg p-3 transition-colors hover:bg-neutral-800/70">
									<div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-neutral-800 text-xs font-bold uppercase text-neutral-500">
										{getFileIcon(file.extension)}
									</div>
									<div class="min-w-0 flex-1">
										<div class="truncate font-medium text-white">{file.name}</div>
										<div class="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
											<span class="uppercase">{file.extension}</span>
											<span>&middot;</span>
											<span>{formatBytes(file.size)}</span>
											<span>&middot;</span>
											<span>{formatDate(file.modifiedAt)}</span>
										</div>
									</div>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>

	<!-- Desktop Sidebar (lg+) -->
	<div class="hidden w-80 flex-shrink-0 border-l border-neutral-800 lg:flex lg:flex-col">
		<TorrentSidebar
			bind:this={sidebarRef}
			{fetchingJobs}
			onCountChange={(count) => (downloadingCount = count)}
		/>
	</div>

	<!-- Mobile Torrents View (below lg, when torrents tab selected) -->
	{#if currentView === 'torrents'}
		<div class="flex flex-1 flex-col lg:hidden">
			<TorrentSidebar
				{fetchingJobs}
				showTitle={true}
				onCountChange={(count) => (downloadingCount = count)}
			/>
		</div>
	{/if}
</div>

<!-- Mobile Bottom Tab Bar (below lg) -->
<div class="flex border-t border-neutral-800 bg-neutral-900 lg:hidden">
	<button
		type="button"
		onclick={() => switchView('search')}
		class="flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors {currentView === 'search'
			? 'text-white'
			: 'text-neutral-500'}"
	>
		<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
		</svg>
		Search
	</button>
	<button
		type="button"
		onclick={() => switchView('library')}
		class="flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors {currentView === 'library'
			? 'text-white'
			: 'text-neutral-500'}"
	>
		<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
		</svg>
		Library
	</button>
	<button
		type="button"
		onclick={() => switchView('torrents')}
		class="relative flex flex-1 flex-col items-center gap-1 py-2 text-xs transition-colors {currentView === 'torrents'
			? 'text-white'
			: 'text-neutral-500'}"
	>
		<div class="relative">
			<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
			</svg>
			{#if downloadingCount > 0}
				<span class="absolute -top-1 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white">
					{downloadingCount}
				</span>
			{/if}
		</div>
		Torrents
	</button>
</div>
