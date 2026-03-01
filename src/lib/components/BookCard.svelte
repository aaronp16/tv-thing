<script lang="ts">
	import type { BookResult } from '$lib/types';

	interface Props {
		book: BookResult;
		onDownload?: (book: BookResult) => void;
		downloading?: boolean;
	}

	let { book, onDownload, downloading = false }: Props = $props();

	// Format author names
	const authorNames = $derived(
		book.authors.length > 0 ? book.authors.map((a) => a.name).join(', ') : 'Unknown Author'
	);

	// Format series info
	const seriesInfo = $derived.by(() => {
		if (book.series.length === 0) return null;
		const s = book.series[0];
		return s.number ? `${s.name} #${s.number}` : s.name;
	});

	// Category without the "Ebooks - " or "Audiobooks - " prefix
	const categoryShort = $derived(book.category.replace(/^(Ebooks|Audiobooks)\s*-\s*/i, ''));

	function handleDownload() {
		if (onDownload && !downloading) {
			onDownload(book);
		}
	}
</script>

<div
	class="group flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-neutral-800/70"
>
	<!-- Book icon -->
	<div
		class="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-neutral-800 text-neutral-600"
	>
		<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="1.5"
				d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
			/>
		</svg>
	</div>

	<!-- Book Info -->
	<div class="flex min-w-0 flex-1 flex-col gap-0.5">
		<!-- Title -->
		<div class="flex items-center gap-2">
			<span class="truncate font-medium text-white">{book.title}</span>
			{#if book.freeleech}
				<span
					class="flex-shrink-0 rounded bg-green-700 px-1.5 py-0.5 text-[10px] font-medium text-green-100"
				>
					FL
				</span>
			{/if}
			{#if book.vip}
				<span
					class="flex-shrink-0 rounded bg-yellow-700 px-1.5 py-0.5 text-[10px] font-medium text-yellow-100"
				>
					VIP
				</span>
			{/if}
		</div>

		<!-- Author -->
		<div class="truncate text-sm text-neutral-400">
			{authorNames}
		</div>

		<!-- Series & Category -->
		<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500">
			{#if seriesInfo}
				<span class="text-neutral-400">{seriesInfo}</span>
				<span class="text-neutral-600">&middot;</span>
			{/if}
			<span>{categoryShort}</span>
			<span class="text-neutral-600">&middot;</span>
			<span class="uppercase">{book.fileType}</span>
			<span class="text-neutral-600">&middot;</span>
			<span>{book.sizeFormatted}</span>
		</div>

		<!-- Seeders / Leechers -->
		<div class="mt-1 flex items-center gap-3 text-xs">
			<span class="flex items-center gap-1 text-green-500">
				<svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
					<path
						fill-rule="evenodd"
						d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
						clip-rule="evenodd"
					/>
				</svg>
				{book.seeders}
			</span>
			<span class="flex items-center gap-1 text-red-400">
				<svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
					<path
						fill-rule="evenodd"
						d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z"
						clip-rule="evenodd"
					/>
				</svg>
				{book.leechers}
			</span>
			<span class="text-neutral-500">{book.snatched} snatched</span>
		</div>
	</div>

	<!-- Download Button -->
	{#if onDownload}
		<button
			type="button"
			onclick={handleDownload}
			disabled={downloading}
			class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-neutral-700 text-white transition-all hover:bg-neutral-600 disabled:opacity-50"
			aria-label="Download"
		>
			{#if downloading}
				<svg class="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
					<circle
						class="opacity-25"
						cx="12"
						cy="12"
						r="10"
						stroke="currentColor"
						stroke-width="4"
					></circle>
					<path
						class="opacity-75"
						fill="currentColor"
						d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
					></path>
				</svg>
			{:else}
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
					/>
				</svg>
			{/if}
		</button>
	{/if}
</div>
