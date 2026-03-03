<script lang="ts">
	/**
	 * Full media detail page for movies and TV shows.
	 * Shows a rich hero section with backdrop, metadata, cast, providers,
	 * and a torrent search section appropriate to the media type.
	 */
	import Badge from '$lib/components/ui/Badge.svelte';
	import StarRating from '$lib/components/ui/StarRating.svelte';
	import PosterImage from '$lib/components/ui/PosterImage.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import CastRow from '$lib/components/discover/CastRow.svelte';
	import WatchProviderBadges from '$lib/components/discover/WatchProviderBadges.svelte';
	import TorrentList from '$lib/components/discover/TorrentList.svelte';
	import SeasonAccordion from '$lib/components/discover/SeasonAccordion.svelte';
	import {
		tmdbImage,
		type TMDBSearchResult,
		type TMDBMovieDetail,
		type TMDBTvDetail,
		type TMDBWatchProviderRegion,
		type TMDBCastMember,
		type TMDBGenre,
		type TMDBSeasonSummary,
		type SearchResult
	} from '$lib/types';

	interface Props {
		item: TMDBSearchResult;
		onBack: () => void;
		onDownload: (result: SearchResult) => void;
		downloadingIds: Set<number>;
	}

	let { item, onBack, onDownload, downloadingIds }: Props = $props();

	// Detail data
	let movieDetail = $state<TMDBMovieDetail | null>(null);
	let tvDetail = $state<TMDBTvDetail | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let isDownloaded = $state(false);

	// TV-specific state
	let tvMode = $state<'boxsets' | 'episodes'>('episodes');
	let selectedBoxsetSeason = $state<number>(1);

	// Derived data
	const isMovie = $derived(item.media_type === 'movie');
	const detail = $derived(isMovie ? movieDetail : tvDetail);
	const seriesId = $derived(item.id);

	const title = $derived(
		isMovie ? movieDetail?.title || item.title || '' : tvDetail?.name || item.name || ''
	);

	const overview = $derived(isMovie ? movieDetail?.overview : tvDetail?.overview);

	const tagline = $derived(isMovie ? movieDetail?.tagline : tvDetail?.tagline);

	const backdropPath = $derived(
		(isMovie ? movieDetail?.backdrop_path : tvDetail?.backdrop_path) || item.backdrop_path
	);

	const posterPath = $derived(
		(isMovie ? movieDetail?.poster_path : tvDetail?.poster_path) || item.poster_path
	);

	const genres = $derived<TMDBGenre[]>((isMovie ? movieDetail?.genres : tvDetail?.genres) || []);

	const cast = $derived<TMDBCastMember[]>(
		((isMovie ? movieDetail?.credits?.cast : tvDetail?.credits?.cast) || []).slice(0, 20)
	);

	const watchProviders = $derived.by<TMDBWatchProviderRegion | null>(() => {
		const wp = isMovie ? movieDetail?.['watch/providers'] : tvDetail?.['watch/providers'];
		if (!wp?.results) return null;
		// Try GB first, then US as fallback
		return wp.results['GB'] || wp.results['US'] || null;
	});

	const imdbId = $derived<string | null>(
		isMovie
			? movieDetail?.imdb_id || movieDetail?.external_ids?.imdb_id || null
			: tvDetail?.external_ids?.imdb_id || null
	);

	const releaseYear = $derived.by(() => {
		const date = isMovie ? movieDetail?.release_date : tvDetail?.first_air_date;
		if (!date) return null;
		return date.split('-')[0];
	});

	const runtime = $derived.by(() => {
		if (isMovie && movieDetail?.runtime) {
			const hrs = Math.floor(movieDetail.runtime / 60);
			const mins = movieDetail.runtime % 60;
			return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
		}
		if (!isMovie && tvDetail) {
			return `${tvDetail.number_of_seasons} season${tvDetail.number_of_seasons !== 1 ? 's' : ''}`;
		}
		return null;
	});

	const seasons = $derived<TMDBSeasonSummary[]>(
		(tvDetail?.seasons || []).filter((s) => s.season_number > 0) // exclude specials (season 0)
	);

	const directors = $derived.by(() => {
		if (isMovie) {
			return (movieDetail?.credits?.crew || [])
				.filter((c) => c.job === 'Director')
				.map((c) => c.name);
		}
		return (tvDetail?.created_by || []).map((c) => c.name);
	});

	const contentRating = $derived.by(() => {
		if (!isMovie && tvDetail?.content_ratings?.results) {
			const gb = tvDetail.content_ratings.results.find((r) => r.iso_3166_1 === 'GB');
			const us = tvDetail.content_ratings.results.find((r) => r.iso_3166_1 === 'US');
			return gb?.rating || us?.rating || null;
		}
		return null;
	});

	// Movie torrent search query
	const movieSearchQuery = $derived.by(() => {
		if (!isMovie) return '';
		const y = releaseYear;
		return y ? `${title} ${y}` : title;
	});

	// TV boxset search query
	const boxsetSearchQuery = $derived.by(() => {
		if (isMovie) return '';
		return `${title} Season ${selectedBoxsetSeason}`;
	});

	// Fetch detail data
	async function fetchDetail() {
		loading = true;
		error = null;
		// Clear stale state from previous item
		movieDetail = null;
		tvDetail = null;
		isDownloaded = false;

		try {
			const endpoint = isMovie ? `/api/tmdb/movie/${item.id}` : `/api/tmdb/tv/${item.id}`;

			const res = await fetch(endpoint);
			if (!res.ok) throw new Error('Failed to fetch details');
			const data = await res.json();

			if (isMovie) {
				movieDetail = data;
			} else {
				tvDetail = data;
				// Default to first real season
				if (data.seasons?.length) {
					const firstReal = data.seasons.find((s: TMDBSeasonSummary) => s.season_number > 0);
					if (firstReal) selectedBoxsetSeason = firstReal.season_number;
				}
			}

			// Check if downloaded
			checkLibrary();
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load details';
		} finally {
			loading = false;
		}
	}

	async function checkLibrary() {
		try {
			const params = new URLSearchParams({
				title,
				mediaType: isMovie ? 'movie' : 'tv',
				tmdbId: String(item.id)
			});
			const y = releaseYear;
			if (y) params.set('year', y);

			const res = await fetch(`/api/library/check?${params}`);
			if (res.ok) {
				const data = await res.json();
				isDownloaded = data.downloaded;
			}
		} catch {
			// Silently fail library check
		}
	}

	$effect(() => {
		fetchDetail();
	});

	function formatDate(date: string | null | undefined): string {
		if (!date) return '';
		try {
			return new Date(date).toLocaleDateString('en-GB', {
				day: 'numeric',
				month: 'long',
				year: 'numeric'
			});
		} catch {
			return date;
		}
	}
</script>

<div class="relative min-h-full">
	{#if loading}
		<!-- Loading skeleton -->
		<div class="animate-fade-in">
			<Skeleton class="h-[400px] w-full" rounded="none" />
			<div class="relative z-10 -mt-20 px-6">
				<div class="flex gap-6">
					<Skeleton class="h-[270px] w-[180px] flex-shrink-0" rounded="lg" />
					<div class="flex-1 space-y-3 pt-8">
						<Skeleton class="h-8 w-3/4" rounded="md" />
						<Skeleton class="h-4 w-1/2" rounded="sm" />
						<Skeleton class="h-20 w-full" rounded="md" />
					</div>
				</div>
			</div>
		</div>
	{:else if error}
		<div class="animate-fade-in py-20 text-center">
			<p class="text-red-400">{error}</p>
			<button
				type="button"
				onclick={fetchDetail}
				class="mt-3 text-sm text-blue-400 transition-colors hover:text-blue-300"
			>
				Try again
			</button>
		</div>
	{:else}
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- HERO SECTION                                                       -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<div class="relative">
			<!-- Backdrop image -->
			{#if backdropPath}
				<div class="animate-backdrop-reveal relative h-[350px] overflow-hidden sm:h-[420px]">
					<img
						src={tmdbImage(backdropPath, 'w1280')}
						alt=""
						class="h-full w-full object-cover object-top"
					/>
					<!-- Gradient overlays -->
					<div class="gradient-hero absolute inset-0"></div>
					<div class="gradient-hero-r absolute inset-0 sm:hidden"></div>
				</div>
			{:else}
				<div class="h-[200px] bg-gradient-to-b from-neutral-800/50 to-neutral-900"></div>
			{/if}

			<!-- Content overlay -->
			<div
				class="relative px-4 sm:px-6 {backdropPath ? '-mt-44 sm:-mt-52' : ''} animate-slide-up-fade
				z-10"
				style="animation-delay: 200ms"
			>
				<div class="flex flex-col gap-5 sm:flex-row sm:gap-6">
					<!-- Poster -->
					<div class="flex-shrink-0 self-center sm:self-start">
						<div
							class="w-[140px] overflow-hidden rounded-xl shadow-2xl
							ring-1 shadow-black/50 ring-white/10 transition-transform
							duration-300 hover:scale-[1.02] sm:w-[180px]"
						>
							<PosterImage path={posterPath} alt={title} size="w342" class="w-full" />
						</div>
					</div>

					<!-- Info -->
					<div class="min-w-0 flex-1 sm:pt-6">
						<!-- Title + downloaded badge -->
						<div class="flex items-start gap-3">
							<h1 class="text-2xl leading-tight font-bold text-white sm:text-3xl">
								{title}
							</h1>
						</div>

						<!-- In Library banner -->
						{#if isDownloaded}
							<div
								class="mt-3 flex items-center gap-2.5 rounded-xl bg-emerald-500/10 px-4 py-3 ring-1 ring-emerald-500/25"
							>
								<svg
									class="h-5 w-5 flex-shrink-0 text-emerald-400"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24"
									stroke-width="2.5"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<span class="text-sm font-semibold text-emerald-300">In your library</span>
							</div>
						{/if}

						<!-- Tagline -->
						{#if tagline}
							<p class="mt-1.5 text-sm text-neutral-400 italic">{tagline}</p>
						{/if}

						<!-- Meta pills row -->
						<div class="mt-3 flex flex-wrap items-center gap-2">
							{#if item.vote_average > 0}
								<div class="rounded-full bg-white/[0.06] px-2.5 py-1 ring-1 ring-white/[0.06]">
									<StarRating score={item.vote_average} size="md" />
								</div>
							{/if}

							{#if releaseYear}
								<Badge variant="default" size="md">{releaseYear}</Badge>
							{/if}

							{#if runtime}
								<Badge variant="default" size="md">{runtime}</Badge>
							{/if}

							{#if contentRating}
								<Badge variant="warning" size="md">{contentRating}</Badge>
							{/if}

							<Badge variant={isMovie ? 'primary' : 'accent'} size="md">
								{isMovie ? 'Movie' : 'TV Series'}
							</Badge>
						</div>

						<!-- Genres -->
						{#if genres.length > 0}
							<div class="mt-3 flex flex-wrap gap-1.5">
								{#each genres as genre}
									<span
										class="rounded-full bg-gradient-to-r from-white/[0.04] to-white/[0.02] px-2.5
										py-0.5 text-xs text-neutral-300
										ring-1 ring-white/[0.06]"
									>
										{genre.name}
									</span>
								{/each}
							</div>
						{/if}

						<!-- Director/Creator -->
						{#if directors.length > 0}
							<p class="mt-3 text-xs text-neutral-500">
								<span class="text-neutral-400">{isMovie ? 'Directed by' : 'Created by'}</span>
								{directors.join(', ')}
							</p>
						{/if}

						<!-- Watch providers -->
						{#if watchProviders}
							<div class="mt-3">
								<WatchProviderBadges providers={watchProviders} />
							</div>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- OVERVIEW                                                           -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		{#if overview}
			<div class="animate-slide-up-fade mt-6 px-4 sm:px-6" style="animation-delay: 300ms">
				<h2 class="mb-2 text-sm font-semibold tracking-wider text-neutral-400 uppercase">
					Overview
				</h2>
				<p class="max-w-3xl text-sm leading-relaxed text-neutral-300">{overview}</p>
			</div>
		{/if}

		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- CAST                                                               -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		{#if cast.length > 0}
			<div class="animate-slide-up-fade mt-6" style="animation-delay: 400ms">
				<h2
					class="mb-3 px-4 text-sm font-semibold tracking-wider text-neutral-400 uppercase sm:px-6"
				>
					Cast
				</h2>
				<CastRow {cast} />
			</div>
		{/if}

		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- TORRENTS SECTION                                                   -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<div class="animate-slide-up-fade mt-8 px-4 pb-8 sm:px-6" style="animation-delay: 500ms">
			<div class="mb-4 flex items-center gap-3">
				<h2 class="text-sm font-semibold tracking-wider text-neutral-400 uppercase">Torrents</h2>
				<div class="h-px flex-1 bg-gradient-to-r from-white/[0.06] to-transparent"></div>
			</div>

			{#if isMovie}
				<!-- ─── Movie: Single torrent search ─────────────────────────── -->
				<TorrentList
					query={movieSearchQuery}
					category="movies"
					imdbId={imdbId || undefined}
					{onDownload}
					{downloadingIds}
				/>
			{:else}
				<!-- ─── TV: Mode toggle ──────────────────────────────────────── -->
				<div
					class="mb-5 flex w-fit items-center gap-1 rounded-xl bg-white/[0.03]
					p-1 ring-1 ring-white/[0.06]"
				>
					<button
						type="button"
						onclick={() => (tvMode = 'episodes')}
						class="rounded-lg px-4 py-1.5 text-sm font-medium transition-all duration-200
							{tvMode === 'episodes'
							? 'bg-white/[0.08] text-white shadow-sm ring-1 ring-white/[0.08]'
							: 'text-neutral-500 hover:text-neutral-300'}"
					>
						Episodes
					</button>
					<button
						type="button"
						onclick={() => (tvMode = 'boxsets')}
						class="rounded-lg px-4 py-1.5 text-sm font-medium transition-all duration-200
							{tvMode === 'boxsets'
							? 'bg-white/[0.08] text-white shadow-sm ring-1 ring-white/[0.08]'
							: 'text-neutral-500 hover:text-neutral-300'}"
					>
						Box Sets
					</button>
				</div>

				{#if tvMode === 'episodes'}
					<!-- ─── Individual Episodes Mode ──────────────────────────── -->
					<div class="space-y-3">
						{#each seasons as season, i}
							<div class="animate-float-up" style="animation-delay: {i * 60}ms">
								<SeasonAccordion
									{seriesId}
									seriesName={title}
									{season}
									{onDownload}
									{downloadingIds}
								/>
							</div>
						{/each}
					</div>
				{:else}
					<!-- ─── Box Sets Mode ─────────────────────────────────────── -->
					<div class="space-y-4">
						<!-- Season selector -->
						{#if seasons.length > 1}
							<div class="flex flex-wrap gap-2">
								{#each seasons as s}
									<button
										type="button"
										onclick={() => (selectedBoxsetSeason = s.season_number)}
										class="rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200
											{selectedBoxsetSeason === s.season_number
											? 'bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/25'
											: 'bg-white/[0.03] text-neutral-500 ring-1 ring-white/[0.06] hover:bg-white/[0.05] hover:text-neutral-300'}"
									>
										Season {s.season_number}
									</button>
								{/each}
								<button
									type="button"
									onclick={() => (selectedBoxsetSeason = 0)}
									class="rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200
										{selectedBoxsetSeason === 0
										? 'bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/25'
										: 'bg-white/[0.03] text-neutral-500 ring-1 ring-white/[0.06] hover:bg-white/[0.05] hover:text-neutral-300'}"
								>
									Complete Series
								</button>
							</div>
						{/if}

						<!-- Torrent results for selected boxset -->
						{#key selectedBoxsetSeason}
							<TorrentList
								query={selectedBoxsetSeason === 0 ? `${title} Complete` : boxsetSearchQuery}
								category="tv-boxsets"
								imdbId={imdbId || undefined}
								{onDownload}
								{downloadingIds}
							/>
						{/key}
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>
