<script lang="ts">
	/**
	 * Season accordion for TV show detail page.
	 * Expands to show episodes and torrent search per-episode.
	 */
	import TorrentList from '$lib/components/discover/TorrentList.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import type { TMDBSeasonSummary, TMDBEpisode, TMDBSeasonDetail, SearchResult } from '$lib/types';
	import { tmdbImage } from '$lib/types';
	import { onMount } from 'svelte';

	interface Props {
		seriesId: number;
		seriesName: string;
		season: TMDBSeasonSummary;
		onDownload: (result: SearchResult) => void;
		downloadingIds: Set<number>;
		class?: string;
	}

	let {
		seriesId,
		seriesName,
		season,
		onDownload,
		downloadingIds,
		class: className = ''
	}: Props = $props();

	let isOpen = $state(false);
	let episodes: TMDBEpisode[] = $state([]);
	let loading = $state(false);
	let loaded = $state(false);
	let selectedEpisode = $state<number | null>(null);
	let isSeasonDownloaded = $state(false);

	onMount(async () => {
		try {
			const params = new URLSearchParams({
				title: seriesName,
				mediaType: 'tv',
				season: String(season.season_number)
			});
			const res = await fetch(`/api/library/check?${params}`);
			if (res.ok) {
				const data = await res.json();
				isSeasonDownloaded = data.downloaded;
			}
		} catch {
			// silently ignore
		}
	});

	async function toggle() {
		isOpen = !isOpen;

		if (isOpen && !loaded) {
			loading = true;
			try {
				const res = await fetch(`/api/tmdb/tv/${seriesId}/season/${season.season_number}`);
				if (!res.ok) throw new Error('Failed to fetch season');
				const data: TMDBSeasonDetail = await res.json();
				episodes = data.episodes || [];
				loaded = true;
			} catch {
				episodes = [];
			} finally {
				loading = false;
			}
		}
	}

	function selectEpisode(epNum: number) {
		selectedEpisode = selectedEpisode === epNum ? null : epNum;
	}

	function buildEpisodeQuery(ep: TMDBEpisode): string {
		const sNum = String(season.season_number).padStart(2, '0');
		const eNum = String(ep.episode_number).padStart(2, '0');
		return `${seriesName} S${sNum}E${eNum}`;
	}

	function formatDate(date: string | null): string {
		if (!date) return '';
		try {
			return new Date(date).toLocaleDateString('en-GB', {
				day: 'numeric',
				month: 'short',
				year: 'numeric'
			});
		} catch {
			return date;
		}
	}
</script>

<div class="overflow-hidden rounded-xl ring-1 ring-white/[0.06] {className}">
	<!-- Accordion header -->
	<button
		type="button"
		onclick={toggle}
		class="flex w-full items-center gap-3 bg-white/[0.02] px-4 py-3
			text-left transition-colors duration-200 hover:bg-white/[0.04]"
	>
		<!-- Chevron -->
		<svg
			class="h-4 w-4 flex-shrink-0 text-neutral-500 transition-transform duration-300
				{isOpen ? 'rotate-90' : ''}"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
		</svg>

		<!-- Season info -->
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<span class="text-sm font-semibold text-neutral-200">{season.name}</span>
				<span class="text-xs text-neutral-500">{season.episode_count} episodes</span>
				{#if isSeasonDownloaded}
					<span
						class="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-400 ring-1 ring-emerald-500/25"
					>
						<svg
							class="h-3 w-3"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
							stroke-width="2.5"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
						</svg>
						In library
					</span>
				{/if}
			</div>
			{#if season.air_date}
				<span class="text-xs text-neutral-600">{formatDate(season.air_date)}</span>
			{/if}
		</div>

		<!-- Episode count pill -->
		<span
			class="flex-shrink-0 rounded-full bg-white/[0.04] px-2 py-0.5 text-[11px]
			font-medium text-neutral-400 ring-1 ring-white/[0.06]"
		>
			{season.episode_count} ep
		</span>
	</button>

	<!-- Accordion body -->
	{#if isOpen}
		<div class="animate-slide-up-fade border-t border-white/[0.04]">
			{#if loading}
				<div class="space-y-3 p-4">
					{#each Array(4) as _, i}
						<Skeleton class="h-14 w-full" rounded="lg" />
					{/each}
				</div>
			{:else if episodes.length === 0}
				<div class="py-8 text-center text-sm text-neutral-500">No episodes found</div>
			{:else}
				<div class="divide-y divide-white/[0.03]">
					{#each episodes as ep, i}
						<div class="animate-float-up" style="animation-delay: {i * 20}ms">
							<!-- Episode row -->
							<button
								type="button"
								onclick={() => selectEpisode(ep.episode_number)}
								class="flex w-full items-start gap-3 px-4 py-3 text-left
									transition-colors duration-150 hover:bg-white/[0.03]
									{selectedEpisode === ep.episode_number ? 'bg-white/[0.04]' : ''}"
							>
								<!-- Episode number -->
								<span
									class="flex h-8 w-8 flex-shrink-0 items-center
									justify-center rounded-lg bg-white/[0.04] text-xs font-semibold text-neutral-400
									ring-1 ring-white/[0.06]"
								>
									{ep.episode_number}
								</span>

								<!-- Episode still image (thumbnail) -->
								{#if ep.still_path}
									<div
										class="hidden h-14 w-24 flex-shrink-0 overflow-hidden rounded-lg ring-1
										ring-white/[0.06] sm:block"
									>
										<img
											src={tmdbImage(ep.still_path, 'w185')}
											alt={ep.name}
											loading="lazy"
											class="h-full w-full object-cover"
										/>
									</div>
								{/if}

								<!-- Episode info -->
								<div class="min-w-0 flex-1">
									<p class="truncate text-sm font-medium text-neutral-200">{ep.name}</p>
									{#if ep.overview}
										<p class="mt-0.5 line-clamp-2 text-xs leading-relaxed text-neutral-500">
											{ep.overview}
										</p>
									{/if}
									<div class="mt-1 flex items-center gap-2">
										{#if ep.air_date}
											<span class="text-[11px] text-neutral-600">{formatDate(ep.air_date)}</span>
										{/if}
										{#if ep.runtime}
											<span class="text-[11px] text-neutral-600">{ep.runtime}min</span>
										{/if}
									</div>
								</div>

								<!-- Expand indicator -->
								<svg
									class="h-4 w-4 flex-shrink-0 self-center text-neutral-600 transition-transform duration-200
										{selectedEpisode === ep.episode_number ? 'rotate-180' : ''}"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M19 9l-7 7-7-7"
									/>
								</svg>
							</button>

							<!-- Torrent list for selected episode -->
							{#if selectedEpisode === ep.episode_number}
								<div
									class="animate-slide-up-fade border-t border-white/[0.03] bg-white/[0.01] px-4
									py-3"
								>
									<TorrentList
										query={buildEpisodeQuery(ep)}
										category="tv-episodes"
										{onDownload}
										{downloadingIds}
									/>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>
