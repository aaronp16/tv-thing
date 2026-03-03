<script lang="ts">
	/**
	 * Discover search results grid.
	 * Shows TMDB search results as poster cards with metadata overlays.
	 */
	import PosterImage from '$lib/components/ui/PosterImage.svelte';
	import StarRating from '$lib/components/ui/StarRating.svelte';
	import Badge from '$lib/components/ui/Badge.svelte';
	import DownloadedCheck from '$lib/components/ui/DownloadedCheck.svelte';
	import WatchProviderBadges from '$lib/components/discover/WatchProviderBadges.svelte';
	import Skeleton from '$lib/components/ui/Skeleton.svelte';
	import {
		tmdbDisplayTitle,
		tmdbYear,
		type TMDBSearchResult,
		type TMDBWatchProviderRegion
	} from '$lib/types';

	interface Props {
		results: TMDBSearchResult[];
		loading?: boolean;
		downloadedIds?: Set<number>;
		watchProviders?: Record<number, TMDBWatchProviderRegion | null>;
		onSelect: (item: TMDBSearchResult) => void;
		class?: string;
	}

	let {
		results,
		loading = false,
		downloadedIds = new Set(),
		watchProviders = {},
		onSelect,
		class: className = ''
	}: Props = $props();
</script>

<div class={className}>
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
	{:else if results.length === 0}
		<div class="animate-fade-in py-20 text-center">
			<svg
				class="mx-auto mb-4 h-16 w-16 text-neutral-700"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1"
					d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
				/>
			</svg>
			<p class="text-sm text-neutral-500">No results found</p>
			<p class="mt-1 text-xs text-neutral-600">Try a different search term</p>
		</div>
	{:else}
		<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
			{#each results as item, i (item.id)}
				{@const title = tmdbDisplayTitle(item)}
				{@const year = tmdbYear(item)}
				{@const isDownloaded = downloadedIds.has(item.id)}

				<button
					type="button"
					onclick={() => onSelect(item)}
					class="group animate-float-up rounded-xl text-left focus:outline-none
						focus-visible:ring-2 focus-visible:ring-blue-500/50"
					style="animation-delay: {i * 50}ms"
				>
					<!-- Poster -->
					<div
						class="card-hover relative overflow-hidden rounded-xl
						ring-1 ring-white/[0.06]"
					>
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

						<!-- Type badge -->
						<div class="absolute top-2 left-2">
							<Badge variant={item.media_type === 'movie' ? 'primary' : 'accent'} size="xs">
								{item.media_type === 'movie' ? 'Movie' : 'TV'}
							</Badge>
						</div>

						<!-- Downloaded indicator -->
						{#if isDownloaded}
							<div class="absolute top-2 right-2">
								<DownloadedCheck size="sm" />
							</div>
						{/if}

						<!-- Rating pill (bottom-right of poster) -->
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
							class="truncate text-sm font-medium text-neutral-200
							transition-colors group-hover:text-white"
						>
							{title}
						</h3>
						<div class="mt-0.5 flex items-center gap-2">
							{#if year}
								<span class="text-xs text-neutral-500">{year}</span>
							{/if}
							{#if watchProviders[item.id]}
								<WatchProviderBadges providers={watchProviders[item.id]} compact class="ml-auto" />
							{/if}
						</div>
					</div>
				</button>
			{/each}
		</div>
	{/if}
</div>
