<script lang="ts">
	/**
	 * Watch provider badges - shows streaming service logos.
	 * Displays flatrate (subscription) providers primarily,
	 * with optional rent/buy providers.
	 */
	import { tmdbImage, type TMDBWatchProvider, type TMDBWatchProviderRegion } from '$lib/types';

	interface Props {
		providers: TMDBWatchProviderRegion | null;
		compact?: boolean;
		class?: string;
	}

	let { providers, compact = false, class: className = '' }: Props = $props();

	// Prioritize flatrate (subscription), then ads, then rent
	const displayProviders = $derived.by(() => {
		if (!providers) return [];
		const all: TMDBWatchProvider[] = [...(providers.flatrate || []), ...(providers.ads || [])];
		// Deduplicate by provider_id
		const seen = new Set<number>();
		return all
			.filter((p) => {
				if (seen.has(p.provider_id)) return false;
				seen.add(p.provider_id);
				return true;
			})
			.slice(0, compact ? 4 : 8);
	});
</script>

{#if displayProviders.length > 0}
	<div class="flex items-center gap-1.5 {className}">
		{#each displayProviders as provider, i}
			<div class="group animate-badge-pop relative" style="animation-delay: {i * 50}ms">
				<img
					src={tmdbImage(provider.logo_path, 'w45')}
					alt={provider.provider_name}
					class="rounded-md ring-1 ring-white/10 transition-transform duration-200 group-hover:scale-110
						{compact ? 'h-6 w-6' : 'h-8 w-8'}"
				/>
				<!-- Tooltip -->
				<div
					class="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2
					rounded-md bg-neutral-800 px-2 py-1 text-xs
					whitespace-nowrap text-white opacity-0 shadow-lg
					ring-1 ring-white/10 transition-opacity group-hover:opacity-100"
				>
					{provider.provider_name}
				</div>
			</div>
		{/each}
	</div>
{/if}
