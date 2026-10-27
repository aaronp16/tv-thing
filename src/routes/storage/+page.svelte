<script lang="ts">
	/**
	 * Storage — disk usage overview with WinDirStat-style maps of the torrents
	 * folder and the library, plus delete and cleanup actions.
	 */
	import { onMount } from 'svelte';
	import Treemap from '$lib/components/storage/Treemap.svelte';
	import LibraryDeleteModal from '$lib/components/storage/LibraryDeleteModal.svelte';
	import TorrentDeleteModal from '$lib/components/storage/TorrentDeleteModal.svelte';
	import CleanupModal from '$lib/components/storage/CleanupModal.svelte';
	import type { StorageNode, StorageReport, StorageTorrent } from '$lib/types';
	import { formatBytes, formatDuration } from '$lib/format';
	import { isCleanupCandidate, torrentsLinkedTo, type DeleteResult } from '$lib/storage';
	import { toasts } from '$lib/stores/toasts';

	let report = $state<StorageReport | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let innerWidth = $state(1024);

	type Dialog =
		| { kind: 'library'; node: StorageNode; ancestors: StorageNode[] }
		| { kind: 'torrent'; torrent: StorageTorrent }
		| { kind: 'cleanup' };
	let dialog = $state<Dialog | null>(null);

	async function load(force = false) {
		loading = true;
		error = null;
		try {
			const res = await fetch(`/api/storage${force ? '?refresh=1' : ''}`);
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Failed to scan storage');
			report = data;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to scan storage';
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		load();
	});

	// ─── Derived numbers ──────────────────────────────────────────────────────

	const torrentByHash = $derived(new Map((report?.torrentDetails ?? []).map((t) => [t.hash, t])));
	const cleanup = $derived(report?.torrentDetails.filter(isCleanupCandidate) ?? []);
	const cleanupBytes = $derived(cleanup.reduce((s, t) => s + t.size, 0));

	const groupSize = (root: StorageNode | undefined, id: string) =>
		root?.children?.find((g) => g.id === id)?.size ?? 0;

	const segments = $derived.by(() => {
		if (!report) return [];
		const tv = groupSize(report.library, 'lib-group:tv');
		const movies = groupSize(report.library, 'lib-group:movies');
		const libOther = groupSize(report.library, 'lib-group:other');
		const torrents = report.torrents.size;
		const rest = Math.max(0, report.disk.used - report.library.size - torrents);
		return [
			{ label: 'TV shows', size: tv, color: 'var(--color-tide-400)' },
			{ label: 'Movies', size: movies, color: 'var(--color-gold-400)' },
			{ label: 'Torrents', size: torrents, color: 'var(--color-sage-500)' },
			{ label: 'Other media', size: libOther, color: 'var(--color-neutral-500)' },
			{ label: 'Rest of disk', size: rest, color: 'var(--color-neutral-700)' },
			{ label: 'Free', size: report.disk.free, color: 'var(--color-neutral-850)' }
		];
	});

	const mobile = $derived(innerWidth < 640);

	// ─── Colours ──────────────────────────────────────────────────────────────

	/** Stable 0..1 value per id so neighbouring tiles get different shades */
	function shade(id: string): number {
		let h = 0;
		for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
		return (Math.abs(h) % 1000) / 1000;
	}

	function libraryColor(node: StorageNode, ancestors: StorageNode[]): string {
		const group = ancestors[0]?.id;
		const l =
			0.36 + shade(ancestors[1]?.id ?? node.id) * 0.14 + (ancestors[1] ? shade(node.id) * 0.05 : 0);
		if (group === 'lib-group:tv') return `oklch(${l} 0.055 200)`;
		if (group === 'lib-group:movies') return `oklch(${l + 0.02} 0.09 78)`;
		return `oklch(${l - 0.02} 0.012 70)`;
	}

	function torrentColor(node: StorageNode): string {
		const l = 0.4 + shade(node.id) * 0.1;
		const t = node.hash ? torrentByHash.get(node.hash) : undefined;
		if (!t) return `oklch(${l - 0.04} 0.01 70)`;
		if (t.tl?.safe) return `oklch(${l} 0.075 138)`;
		if (t.tl) return `oklch(${l} 0.095 48)`;
		return `oklch(${l + 0.06} 0.02 70)`;
	}

	// ─── Tooltips ─────────────────────────────────────────────────────────────

	function describeTorrent(node: StorageNode): string | null {
		const t = node.hash ? torrentByHash.get(node.hash) : undefined;
		if (!t) return null;
		const status = !t.tl
			? 'Not on TL snatchlist'
			: t.tl.safe
				? `Safe to delete · seeded ${formatDuration(t.tl.seedSeconds)}`
				: `H&R risk · seeded ${formatDuration(t.tl.seedSeconds)} of ${t.tl.requiredHours / 24} days`;
		const missing = t.videoFiles - t.linkedVideoFiles;
		return missing > 0 ? `${status} · ${missing} video(s) not in library` : status;
	}

	function describeLibrary(node: StorageNode): string | null {
		if (!node.path || !report) return null;
		const n = torrentsLinkedTo(node.path, report.torrentDetails).length;
		return n > 0 ? `${n} torrent${n === 1 ? '' : 's'} still in qBittorrent` : null;
	}

	// ─── Actions ──────────────────────────────────────────────────────────────

	function selectLibrary(node: StorageNode, ancestors: StorageNode[]) {
		if (!node.path) {
			toasts.info(`${node.name} isn't managed by tv-thing`);
			return;
		}
		dialog = { kind: 'library', node, ancestors };
	}

	function selectTorrent(node: StorageNode) {
		const torrent = node.hash ? torrentByHash.get(node.hash) : undefined;
		if (!torrent) {
			toasts.info(`${node.name} isn't a TV or movie torrent managed by tv-thing`);
			return;
		}
		dialog = { kind: 'torrent', torrent };
	}

	function handleDeleted(result: DeleteResult) {
		dialog = null;
		const parts = [];
		if (result.deletedPaths.length) parts.push(`${result.deletedPaths.length} library item(s)`);
		if (result.deletedTorrents.length) parts.push(`${result.deletedTorrents.length} torrent(s)`);
		if (parts.length) toasts.success(`Deleted ${parts.join(' and ')}`);
		for (const err of result.errors) toasts.error(err, 8000);
		load(true);
	}

	const selectedId = $derived(
		dialog?.kind === 'library'
			? dialog.node.id
			: dialog?.kind === 'torrent'
				? `t:${dialog.torrent.hash}`
				: null
	);
</script>

<svelte:window bind:innerWidth />

<svelte:head>
	<title>Storage · tv-thing</title>
</svelte:head>

<div class="scrollbar-thin h-full w-full overflow-y-auto">
	<div class="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">
		<!-- Header -->
		<div class="mb-5 flex items-center gap-3">
			<a
				href="/"
				aria-label="Back"
				class="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800 text-neutral-300 transition-colors hover:bg-neutral-700 hover:text-white"
			>
				<svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15 19l-7-7 7-7"
					/>
				</svg>
			</a>
			<h1 class="flex-1 font-display text-4xl text-white">Storage</h1>
			<button
				type="button"
				onclick={() => load(true)}
				disabled={loading}
				aria-label="Rescan"
				class="rounded-full p-2 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-white disabled:opacity-50"
			>
				<svg
					class="h-4 w-4 {loading ? 'animate-spin' : ''}"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
					/>
				</svg>
			</button>
		</div>

		{#if error && !report}
			<div class="rounded-xl bg-brick-900/20 p-4 text-sm text-brick-400">
				{error}
				<button
					type="button"
					onclick={() => load(true)}
					class="ml-2 text-gold-400 hover:text-gold-300">Try again</button
				>
			</div>
		{:else if !report}
			<!-- First scan -->
			<div class="space-y-4">
				<div class="shimmer h-16 rounded-xl bg-neutral-800"></div>
				<div class="shimmer h-80 rounded-xl bg-neutral-800"></div>
				<div class="shimmer h-96 rounded-xl bg-neutral-800"></div>
				<p class="text-center text-xs text-neutral-500">
					Scanning the disk and checking TorrentLeech… this can take 10–15 seconds.
				</p>
			</div>
		{:else}
			<!-- Disk summary -->
			<section class="mb-8">
				<div class="mb-2 flex items-baseline justify-between gap-2">
					<p class="text-sm text-neutral-300">
						<span class="font-display text-3xl text-white">{formatBytes(report.disk.free)}</span>
						free of {formatBytes(report.disk.total)}
					</p>
					<p class="text-xs text-neutral-500">
						{Math.round((report.disk.used / report.disk.total) * 100)}% used
					</p>
				</div>
				<div class="flex h-3 overflow-hidden rounded-full bg-neutral-800">
					{#each segments as seg (seg.label)}
						<div
							class="h-full"
							style="width: {(seg.size / report.disk.total) * 100}%; background-color: {seg.color}"
							title="{seg.label}: {formatBytes(seg.size)}"
						></div>
					{/each}
				</div>
				<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1">
					{#each segments as seg (seg.label)}
						<span class="flex items-center gap-1.5 text-xs text-neutral-400">
							<span class="h-2.5 w-2.5 rounded-sm" style="background-color: {seg.color}"></span>
							{seg.label}
							<span class="text-neutral-500">{formatBytes(seg.size)}</span>
						</span>
					{/each}
				</div>
			</section>

			<!-- Torrents -->
			<section class="mb-8">
				<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
					<h2 class="font-display text-2xl text-white">
						Torrents <span class="text-sm font-normal text-neutral-500"
							>{formatBytes(report.torrents.size)}</span
						>
					</h2>
					<button
						type="button"
						onclick={() => (dialog = { kind: 'cleanup' })}
						class="rounded-full px-4 py-1.5 text-sm font-medium transition-colors {cleanup.length >
						0
							? 'bg-white text-black hover:bg-neutral-200'
							: 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}"
					>
						Clean up finished{#if cleanup.length > 0}
							{' · '}{cleanup.length} · {formatBytes(cleanupBytes)}{/if}
					</button>
				</div>
				<div class="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
					<span class="flex items-center gap-1.5"
						><span class="h-2.5 w-2.5 rounded-sm" style="background: oklch(0.45 0.075 138)"
						></span>Safe to delete</span
					>
					<span class="flex items-center gap-1.5"
						><span class="h-2.5 w-2.5 rounded-sm" style="background: oklch(0.45 0.095 48)"
						></span>H&R risk</span
					>
					<span class="flex items-center gap-1.5"
						><span class="h-2.5 w-2.5 rounded-sm" style="background: oklch(0.51 0.02 70)"></span>Not
						on TL snatchlist</span
					>
					<span class="flex items-center gap-1.5"
						><span class="h-2.5 w-2.5 rounded-sm" style="background: oklch(0.41 0.01 70)"
						></span>Other</span
					>
				</div>
				{#if report.tlError}
					<p class="mb-2 rounded-lg bg-ember-900/20 px-3 py-2 text-xs text-ember-400">
						Couldn't check TorrentLeech ({report.tlError}), so hit-and-run status is unknown.
					</p>
				{/if}
				<Treemap
					root={report.torrents}
					height={mobile ? 300 : 380}
					colorOf={torrentColor}
					describe={describeTorrent}
					onSelect={selectTorrent}
					{selectedId}
				/>
			</section>

			<!-- Library -->
			<section>
				<h2 class="mb-3 font-display text-2xl text-white">
					Library <span class="text-sm font-normal text-neutral-500"
						>{formatBytes(report.library.size)}</span
					>
				</h2>
				<Treemap
					root={report.library}
					height={mobile ? 420 : 560}
					colorOf={libraryColor}
					describe={describeLibrary}
					onSelect={selectLibrary}
					{selectedId}
				/>
			</section>
		{/if}
	</div>
</div>

{#if report && dialog?.kind === 'library'}
	<LibraryDeleteModal
		node={dialog.node}
		ancestors={dialog.ancestors}
		torrents={report.torrentDetails}
		onClose={() => (dialog = null)}
		onDeleted={handleDeleted}
	/>
{:else if dialog?.kind === 'torrent'}
	<TorrentDeleteModal
		torrent={dialog.torrent}
		onClose={() => (dialog = null)}
		onDeleted={handleDeleted}
	/>
{:else if report && dialog?.kind === 'cleanup'}
	<CleanupModal
		torrents={report.torrentDetails}
		onClose={() => (dialog = null)}
		onDeleted={handleDeleted}
	/>
{/if}
