<script lang="ts">
	import type { AnnaSearchResult } from '$lib/types';

	interface Props {
		book: AnnaSearchResult;
		onDownload?: (book: AnnaSearchResult) => void;
		downloading?: boolean;
	}

	let { book, onDownload, downloading = false }: Props = $props();

	function formatBytes(bytes: number): string {
		if (!bytes || bytes <= 0) return '';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
	}

	function handleDownload() {
		if (onDownload && !downloading) {
			onDownload(book);
		}
	}
</script>

<div class="group flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-neutral-800/70">
	<!-- Book icon or cover thumbnail -->
	<div
		class="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-neutral-800 text-neutral-600"
	>
		{#if book.coverUrl}
			<img src={book.coverUrl} alt="" class="h-full w-full object-cover" loading="lazy" />
		{:else}
			<svg class="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="1.5"
					d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
				/>
			</svg>
		{/if}
	</div>

	<!-- Book Info -->
	<div class="flex min-w-0 flex-1 flex-col gap-0.5">
		<!-- Title -->
		<span class="truncate font-medium text-white">{book.title}</span>

		<!-- Authors -->
		{#if book.authors}
			<div class="truncate text-sm text-neutral-400">{book.authors}</div>
		{/if}

		<!-- Metadata -->
		<div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500">
			<!-- Content type / category line (mirrors BookCard's series & category row) -->
			{#if book.contentType}
				<span>{book.contentType}</span>
				<span class="text-neutral-600">&middot;</span>
			{/if}
			{#if book.extension}
				<span class="uppercase">{book.extension}</span>
			{/if}
			{#if book.sizeBytes > 0}
				<span class="text-neutral-600">&middot;</span>
				<span>{formatBytes(book.sizeBytes)}</span>
			{/if}
			{#if book.year}
				<span class="text-neutral-600">&middot;</span>
				<span>{book.year}</span>
			{/if}
			{#if book.language && book.language !== 'en'}
				<span class="text-neutral-600">&middot;</span>
				<span class="uppercase">{book.language}</span>
			{/if}
		</div>

		<!-- Publisher line -->
		<div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-600">
			{#if book.publisher}
				<span>{book.publisher}</span>
			{/if}
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
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"
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
