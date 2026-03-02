<script lang="ts">
	import type { SearchResult } from '$lib/types';

	interface Props {
		result: SearchResult;
		onDownload?: (result: SearchResult) => void;
		downloading?: boolean;
	}

	let { result, onDownload, downloading = false }: Props = $props();

	function handleDownload() {
		onDownload?.(result);
	}

	/** Extract quality tags from torrent name (e.g. 720p, 1080p, WEB-DL, x265) */
	function extractTags(name: string): string[] {
		const patterns = [
			/\b(2160p|4K|UHD)\b/i,
			/\b(1080p)\b/i,
			/\b(720p)\b/i,
			/\b(480p)\b/i,
			/\b(WEB-?DL|WEBRip|HDTV|BluRay|BDRip|BRRip|DVDRip|DVD-?R|PDTV|HDRip)\b/i,
			/\b(x264|x265|H\.?264|H\.?265|HEVC|AV1)\b/i,
			/\b(DTS|DTS-HD|Atmos|TrueHD|DD5\.1|AAC|FLAC|AC3)\b/i,
			/\b(REMUX)\b/i,
		];

		const tags: string[] = [];
		for (const pattern of patterns) {
			const match = name.match(pattern);
			if (match) {
				tags.push(match[1]);
			}
		}
		return tags;
	}

	const qualityTags = $derived(extractTags(result.name));
</script>

<button
	type="button"
	onclick={handleDownload}
	disabled={downloading}
	class="group flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-all
		{downloading
			? 'cursor-not-allowed bg-neutral-800/30 opacity-60'
			: 'cursor-pointer hover:bg-neutral-800/50 active:bg-neutral-800/70'}"
>
	<!-- Main content -->
	<div class="min-w-0 flex-1">
		<!-- Title row -->
		<div class="flex items-start gap-2">
			<h3 class="truncate text-sm font-medium text-white group-hover:text-blue-400 transition-colors">
				{result.title}
			</h3>
		</div>

		<!-- Tags row -->
		<div class="mt-1.5 flex flex-wrap items-center gap-1.5">
			<!-- Category badge -->
			<span class="rounded bg-neutral-700/80 px-1.5 py-0.5 text-[10px] font-medium text-neutral-300">
				{result.categoryName}
			</span>

			<!-- Freeleech badge -->
			{#if result.freeleech}
				<span class="rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-green-400">
					FL
				</span>
			{/if}

			<!-- Quality tags -->
			{#each qualityTags as tag}
				<span class="rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
					{tag}
				</span>
			{/each}
		</div>

		<!-- Stats row -->
		<div class="mt-1.5 flex items-center gap-3 text-xs text-neutral-500">
			<span>{result.sizeFormatted}</span>
			<span class="flex items-center gap-1">
				<span class="inline-block h-1.5 w-1.5 rounded-full {result.seeders > 0 ? 'bg-green-500' : 'bg-red-500'}"></span>
				{result.seeders}
			</span>
			<span class="text-neutral-600">/ {result.leechers}</span>
			{#if result.completed > 0}
				<span class="hidden sm:inline">{result.completed} done</span>
			{/if}
		</div>
	</div>

	<!-- Download indicator -->
	<div class="flex flex-shrink-0 items-center self-center">
		{#if downloading}
			<svg class="h-5 w-5 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
				<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
				<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
			</svg>
		{:else}
			<svg class="h-5 w-5 text-neutral-600 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
			</svg>
		{/if}
	</div>
</button>
