<script lang="ts">
	/** TorrentLeech hit-and-run status pill for a torrent */
	import type { TLSeedStatus } from '$lib/types';
	import { formatDuration } from '$lib/format';

	interface Props {
		tl: TLSeedStatus | null;
		/** Show seeding time and ratio after the label */
		detailed?: boolean;
	}

	let { tl, detailed = false }: Props = $props();
</script>

{#if !tl}
	<span
		class="rounded-full bg-white/[0.06] px-2 py-0.5 text-[11px] text-neutral-400 ring-1 ring-white/[0.06]"
		>Not on TL snatchlist</span
	>
{:else if tl.safe}
	<span
		class="rounded-full bg-sage-500/15 px-2 py-0.5 text-[11px] text-sage-400 ring-1 ring-sage-500/20"
		>Safe to delete{#if detailed}
			{' · '}seeded {formatDuration(tl.seedSeconds)}, ratio {tl.ratio.toFixed(2)}{/if}</span
	>
{:else}
	<span
		class="rounded-full bg-ember-500/15 px-2 py-0.5 text-[11px] text-ember-400 ring-1 ring-ember-500/20"
		>H&R risk{#if detailed}
			{' · '}seeded {formatDuration(tl.seedSeconds)} of {tl.requiredHours / 24} days, ratio {tl.ratio.toFixed(
				2
			)}{/if}</span
	>
{/if}
