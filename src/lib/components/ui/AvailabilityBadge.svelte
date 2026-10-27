<script lang="ts">
	/**
	 * "In cinemas" / "Coming …" pill for titles that can't be downloaded yet.
	 * Renders nothing for released titles.
	 */
	import type { ReleaseAvailability } from '$lib/types';
	import { formatReleaseDate } from '$lib/format';

	interface Props {
		availability?: ReleaseAvailability;
	}

	let { availability }: Props = $props();
</script>

{#if availability?.status === 'cinema'}
	<span
		class="inline-flex items-center gap-1 rounded-[3px] bg-ember-400 px-1 py-[3px] font-mono text-[9.5px] leading-none font-medium tracking-wider text-black"
		title={availability.date
			? `Digital release ${formatReleaseDate(availability.date)}`
			: 'No digital release date yet'}
	>
		<svg class="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 24 24">
			<path
				d="M4 4h2l2 3h3L9 4h2l2 3h3l-2-3h4a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6a2 2 0 012-2z"
			/>
		</svg>
		IN CINEMAS
	</span>
{:else if availability?.status === 'upcoming'}
	<span
		class="inline-flex items-center rounded-[3px] bg-tide-300 px-1 py-[3px] font-mono text-[9.5px] leading-none font-medium tracking-wider text-black"
	>
		{availability.date
			? `COMING ${formatReleaseDate(availability.date).toUpperCase()}`
			: 'COMING SOON'}
	</span>
{/if}
