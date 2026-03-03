<script lang="ts">
	/**
	 * Horizontal scrollable cast row.
	 * Shows actor photos, names, and character names.
	 */
	import { tmdbImage, type TMDBCastMember } from '$lib/types';

	interface Props {
		cast: TMDBCastMember[];
		maxVisible?: number;
		class?: string;
	}

	let { cast, maxVisible = 20, class: className = '' }: Props = $props();

	const visibleCast = $derived(cast.slice(0, maxVisible));
</script>

{#if visibleCast.length > 0}
	<div class="relative {className}">
		<!-- Fade edges -->
		<div
			class="pointer-events-none absolute top-0 bottom-0 left-0 z-10 w-8
			bg-gradient-to-r from-neutral-900 to-transparent"
		></div>
		<div
			class="pointer-events-none absolute top-0 right-0 bottom-0 z-10 w-8
			bg-gradient-to-l from-neutral-900 to-transparent"
		></div>

		<div class="scrollbar-none flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 py-2">
			{#each visibleCast as member, i}
				<div
					class="animate-float-up w-[80px] flex-shrink-0 snap-start"
					style="animation-delay: {i * 40}ms"
				>
					<!-- Photo -->
					<div
						class="relative mx-auto h-[72px] w-[72px] overflow-hidden rounded-full
						bg-neutral-800 ring-2 ring-white/[0.06]"
					>
						{#if member.profile_path}
							<img
								src={tmdbImage(member.profile_path, 'w185')}
								alt={member.name}
								loading="lazy"
								class="h-full w-full object-cover"
							/>
						{:else}
							<div
								class="flex h-full w-full items-center justify-center bg-gradient-to-br
								from-neutral-700 to-neutral-800"
							>
								<svg class="h-6 w-6 text-neutral-500" fill="currentColor" viewBox="0 0 20 20">
									<path
										fill-rule="evenodd"
										d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
										clip-rule="evenodd"
									/>
								</svg>
							</div>
						{/if}
					</div>

					<!-- Name -->
					<p
						class="mt-2 truncate text-center text-[11px] leading-tight font-medium text-neutral-200"
					>
						{member.name}
					</p>
					<!-- Character -->
					{#if member.character}
						<p class="mt-0.5 truncate text-center text-[10px] leading-tight text-neutral-500">
							{member.character}
						</p>
					{/if}
				</div>
			{/each}
		</div>
	</div>
{/if}
