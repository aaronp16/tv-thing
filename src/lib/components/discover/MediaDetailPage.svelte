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
	import { watchlist } from '$lib/stores/watchlist';
	import { formatReleaseDate } from '$lib/format';
	import {
		tmdbImage,
		type TMDBSearchResult,
		type TMDBMovieDetail,
		type TMDBTvDetail,
		type TMDBWatchProviderRegion,
		type TMDBCastMember,
		type TMDBGenre,
		type TMDBSeasonSummary,
		type SearchResult,
		type DownloadMeta
	} from '$lib/types';

	interface Props {
		item: TMDBSearchResult;
		onBack: () => void;
		onDownload: (result: SearchResult, meta?: DownloadMeta) => void;
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

	/** Movies: from our API's release-date check. TV: not aired yet if first air date is in the future. */
	const availability = $derived.by(() => {
		if (isMovie) return movieDetail?.availability;
		const firstAir = tvDetail?.first_air_date;
		if (!tvDetail) return undefined;
		if (!firstAir || Date.parse(firstAir) > Date.now()) {
			return { status: 'upcoming' as const, date: firstAir || undefined };
		}
		return { status: 'released' as const };
	});

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

	// ─── Downloads ────────────────────────────────────────────────────────────
	// Tag downloads with this title so the library can show them with their poster
	function downloadWithMeta(result: SearchResult) {
		onDownload(result, { tmdbId: item.id, mediaType, title, posterPath });
	}

	// ─── Watch list ───────────────────────────────────────────────────────────
	const mediaType = $derived<'movie' | 'tv'>(isMovie ? 'movie' : 'tv');
	const onWatchlist = $derived(
		$watchlist.some((w) => w.tmdbId === item.id && w.mediaType === mediaType)
	);
	let watchlistBusy = $state(false);

	$effect(() => {
		watchlist.ensureLoaded();
	});

	async function toggleWatchlist() {
		watchlistBusy = true;
		if (onWatchlist) {
			await watchlist.remove({ tmdbId: item.id, mediaType, title });
		} else {
			await watchlist.add({
				tmdbId: item.id,
				mediaType,
				title,
				year: releaseYear || undefined,
				posterPath
			});
		}
		watchlistBusy = false;
	}

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
			<p class="text-brick-400">{error}</p>
			<button
				type="button"
				onclick={fetchDetail}
				class="mt-3 text-sm text-gold-400 transition-colors hover:text-gold-300"
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
				<div
					class="animate-backdrop-reveal relative mx-4 mt-3 h-[350px] overflow-hidden rounded-lg sm:mx-6 sm:h-[420px]"
				>
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
				<div
					class="mx-4 mt-3 h-[200px] rounded-lg bg-gradient-to-b from-neutral-800/50 to-neutral-900 sm:mx-6"
				></div>
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
							class="w-[140px] overflow-hidden rounded-md shadow-2xl
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
							<h1 class="font-display text-[40px] text-white sm:text-6xl">
								{title}
							</h1>
						</div>

						<!-- In Library banner -->
						{#if isDownloaded}
							<div
								class="mt-3 flex items-center gap-2.5 rounded-md border-l-2 border-sage-400 bg-sage-500/10 px-4 py-3"
							>
								<svg
									class="h-5 w-5 flex-shrink-0 text-sage-400"
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
								<span class="text-sm font-semibold text-sage-300">In your library</span>
							</div>
						{:else if !loading}
							{#if availability?.status === 'cinema'}
								<div
									class="mt-3 flex items-start gap-2.5 rounded-md border-l-2 border-ember-400 bg-ember-500/10 px-4 py-3"
								>
									<svg
										class="mt-0.5 h-4 w-4 flex-shrink-0 text-ember-400"
										fill="currentColor"
										viewBox="0 0 24 24"
									>
										<path
											d="M4 4h2l2 3h3L9 4h2l2 3h3l-2-3h4a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z"
										/>
									</svg>
									<div class="text-sm">
										<p class="font-semibold text-ember-300">Only in cinemas</p>
										<p class="text-ember-200/70">
											{availability.date
												? `Digital release expected ${formatReleaseDate(availability.date)} — good torrents usually appear then.`
												: 'No digital release date yet, so good torrents are unlikely.'}
										</p>
									</div>
								</div>
							{:else if availability?.status === 'upcoming'}
								<div
									class="mt-3 flex items-start gap-2.5 rounded-md border-l-2 border-tide-300 bg-tide-500/10 px-4 py-3"
								>
									<svg
										class="mt-0.5 h-4 w-4 flex-shrink-0 text-tide-400"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
										stroke-width="2"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
									<div class="text-sm">
										<p class="font-semibold text-tide-300">
											Not released yet{availability.date
												? ` — out ${formatReleaseDate(availability.date)}`
												: ''}
										</p>
										<p class="text-tide-200/70">Add it to your watch list to keep track.</p>
									</div>
								</div>
							{/if}
							<button
								type="button"
								onclick={toggleWatchlist}
								disabled={watchlistBusy}
								class="mt-3 inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all disabled:opacity-60
									{onWatchlist
									? 'bg-ember-500/15 text-ember-300 ring-1 ring-ember-500/30 hover:bg-ember-500/20'
									: 'bg-white/[0.06] text-neutral-200 ring-1 ring-white/10 hover:bg-white/[0.1]'}"
							>
								<svg
									class="h-4 w-4"
									fill={onWatchlist ? 'currentColor' : 'none'}
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
								{onWatchlist ? 'On your watch list' : 'Add to watch list'}
							</button>
						{/if}

						<!-- Tagline -->
						{#if tagline}
							<p class="mt-1.5 text-sm text-neutral-400 italic">{tagline}</p>
						{/if}

						<!-- Meta pills row -->
						<div class="mt-3 flex flex-wrap items-center gap-2">
							{#if item.vote_average > 0}
								<div class="rounded-[3px] bg-neutral-800 px-2 py-1">
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
									<span class="border-b border-neutral-700 pb-px text-xs text-neutral-300">
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
				<h2 class="mb-3 eyebrow text-gold-400">Overview</h2>
				<p class="max-w-3xl text-sm leading-relaxed text-neutral-300">{overview}</p>
			</div>
		{/if}

		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- CAST                                                               -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		{#if cast.length > 0}
			<div class="animate-slide-up-fade mt-6" style="animation-delay: 400ms">
				<h2 class="mb-3 px-4 eyebrow text-gold-400 sm:px-6">Cast</h2>
				<CastRow {cast} />
			</div>
		{/if}

		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<!-- TORRENTS SECTION                                                   -->
		<!-- ═══════════════════════════════════════════════════════════════════ -->
		<div class="animate-slide-up-fade mt-8 px-4 pb-8 sm:px-6" style="animation-delay: 500ms">
			<div class="mb-4 flex items-center gap-3">
				<h2 class="eyebrow text-gold-400">Torrents</h2>
				<div class="h-px flex-1 bg-neutral-800"></div>
			</div>

			{#if isMovie}
				<!-- ─── Movie: Single torrent search ─────────────────────────── -->
				<TorrentList
					query={movieSearchQuery}
					category="movies"
					imdbId={imdbId || undefined}
					onDownload={downloadWithMeta}
					{downloadingIds}
				/>
			{:else}
				<!-- ─── TV: Mode toggle ──────────────────────────────────────── -->
				<div class="mb-5 flex w-fit items-center gap-5 border-b border-neutral-800">
					<button
						type="button"
						onclick={() => (tvMode = 'episodes')}
						class="-mb-px border-b-2 pb-2 text-sm font-medium transition-colors {tvMode ===
						'episodes'
							? 'border-gold-400 text-white'
							: 'border-transparent text-neutral-500 hover:text-neutral-300'}"
					>
						Episodes
					</button>
					<button
						type="button"
						onclick={() => (tvMode = 'boxsets')}
						class="-mb-px border-b-2 pb-2 text-sm font-medium transition-colors {tvMode ===
						'boxsets'
							? 'border-gold-400 text-white'
							: 'border-transparent text-neutral-500 hover:text-neutral-300'}"
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
									onDownload={downloadWithMeta}
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
											? 'bg-tide-500/15 text-tide-400 ring-1 ring-tide-500/25'
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
										? 'bg-tide-500/15 text-tide-400 ring-1 ring-tide-500/25'
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
								onDownload={downloadWithMeta}
								{downloadingIds}
							/>
						{/key}
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>
