<script lang="ts">
	/**
	 * Library poster tile for a download in progress: faded poster with a
	 * progress ring and percentage in the middle.
	 */
	import type { ActiveDownload } from '$lib/types';
	import { tmdbImage } from '$lib/types';
	import { formatBytes } from '$lib/format';

	interface Props {
		download: ActiveDownload;
		onOpen?: () => void;
	}

	let { download, onOpen }: Props = $props();

	const RADIUS = 22;
	const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

	const pct = $derived(Math.floor(download.progress * 100));
	const dashOffset = $derived(CIRCUMFERENCE * (1 - download.progress));
	const poster = $derived(tmdbImage(download.posterPath, 'w342'));
	let posterFailed = $state(false);

	const caption = $derived.by(() => {
		if (download.status === 'fetching') return 'Starting…';
		if (download.status === 'copying') return 'Adding to library…';
		if (download.status === 'error') return download.error ?? 'Download failed';
		return download.downloadSpeed > 0
			? `${formatBytes(download.downloadSpeed)}/s`
			: 'Waiting for peers';
	});
</script>

<button
	type="button"
	onclick={onOpen}
	disabled={!onOpen}
	class="group relative aspect-[2/3] w-full overflow-hidden rounded-md bg-neutral-800 text-left
		transition-all hover:ring-2 hover:ring-white/20 focus:ring-2 focus:ring-gold-400 focus:outline-none disabled:cursor-default"
	title="{download.title} — {pct}%"
>
	{#if poster && !posterFailed}
		<img
			src={poster}
			alt={download.title}
			onerror={() => (posterFailed = true)}
			class="h-full w-full object-cover opacity-40 brightness-75 grayscale-[30%]"
		/>
	{:else}
		<div class="flex h-full w-full items-start p-2">
			<span class="line-clamp-4 text-[10px] leading-tight break-all text-neutral-500"
				>{download.title}</span
			>
		</div>
	{/if}

	<!-- Progress ring -->
	<div class="absolute inset-0 flex items-center justify-center">
		<div class="relative h-14 w-14">
			<svg class="h-full w-full -rotate-90" viewBox="0 0 56 56" aria-hidden="true">
				<circle
					cx="28"
					cy="28"
					r={RADIUS}
					fill="rgb(0 0 0 / 0.55)"
					stroke="rgb(255 255 255 / 0.15)"
					stroke-width="4"
				/>
				{#if download.status === 'fetching'}
					<circle
						cx="28"
						cy="28"
						r={RADIUS}
						fill="none"
						stroke="var(--color-gold-400)"
						stroke-width="4"
						stroke-linecap="round"
						stroke-dasharray="{CIRCUMFERENCE * 0.25} {CIRCUMFERENCE}"
						class="origin-center animate-spin"
						style="transform-box: fill-box"
					/>
				{:else}
					<circle
						cx="28"
						cy="28"
						r={RADIUS}
						fill="none"
						stroke={download.status === 'error'
							? 'var(--color-brick-400)'
							: download.status === 'copying'
								? 'var(--color-sage-400)'
								: 'var(--color-gold-400)'}
						stroke-width="4"
						stroke-linecap="round"
						stroke-dasharray={CIRCUMFERENCE}
						stroke-dashoffset={dashOffset}
						class="transition-[stroke-dashoffset] duration-700 ease-out"
					/>
				{/if}
			</svg>
			<span
				class="absolute inset-0 flex items-center justify-center font-mono text-[13px] font-medium text-white"
			>
				{#if download.status === 'error'}!{:else if download.status === 'fetching'}…{:else}{pct}<span
						class="text-[9px] text-white/60">%</span
					>{/if}
			</span>
		</div>
	</div>

	<!-- Title + status -->
	<div
		class="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2"
	>
		<p class="truncate text-xs leading-tight font-semibold text-white">{download.title}</p>
		<p
			class="mt-0.5 truncate font-mono text-[10px] {download.status === 'error'
				? 'text-brick-300'
				: 'text-neutral-400'}"
		>
			{caption}
		</p>
	</div>
</button>
