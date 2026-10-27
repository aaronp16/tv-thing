<script lang="ts">
	/**
	 * Remove a torrent (and its downloaded files) from qBittorrent, optionally
	 * deleting its copies in the library too.
	 */
	import Modal from './Modal.svelte';
	import TlStatus from './TlStatus.svelte';
	import type { StorageTorrent } from '$lib/types';
	import { formatBytes } from '$lib/format';
	import { deleteStorage, type DeleteResult } from '$lib/storage';

	interface Props {
		torrent: StorageTorrent;
		onClose: () => void;
		onDeleted: (result: DeleteResult) => void;
	}

	let { torrent, onClose, onDeleted }: Props = $props();

	let alsoLibrary = $state(false);
	let deleting = $state(false);
	let error = $state<string | null>(null);

	const libraryBytes = $derived(torrent.libraryFiles.reduce((s, f) => s + f.size, 0));
	const missingVideos = $derived(torrent.videoFiles - torrent.linkedVideoFiles);

	async function confirm() {
		deleting = true;
		error = null;
		try {
			const result = await deleteStorage({
				torrents: [torrent.hash],
				paths: alsoLibrary ? torrent.libraryFiles.map((f) => f.path) : []
			});
			onDeleted(result);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Delete failed';
			deleting = false;
		}
	}
</script>

<Modal title="Remove torrent" subtitle={torrent.name} {onClose}>
	<div class="flex flex-wrap items-center gap-2">
		<TlStatus tl={torrent.tl} detailed />
		<span class="text-xs text-neutral-500">{formatBytes(torrent.size)} · {torrent.category}</span>
	</div>

	{#if torrent.progress < 1}
		<p class="rounded-lg bg-ember-900/20 p-3 text-xs text-ember-400">
			Still downloading ({Math.round(torrent.progress * 100)}%). Removing it cancels the download.
		</p>
	{:else if torrent.tl && !torrent.tl.safe}
		<p class="rounded-lg bg-ember-900/20 p-3 text-xs text-ember-400">
			Not seeded long enough yet. Removing it now becomes a hit-and-run unless you clear it with TL
			points.
		</p>
	{/if}

	<p class="text-neutral-300">
		Removes the torrent from qBittorrent and deletes its downloaded files from the torrents folder.
	</p>

	{#if missingVideos > 0 && torrent.progress >= 1}
		<p class="rounded-lg bg-brick-900/20 p-3 text-xs text-brick-400">
			{missingVideos} of {torrent.videoFiles} video file{torrent.videoFiles === 1 ? '' : 's'} in this
			torrent {missingVideos === 1 ? 'has' : 'have'} no copy in the library. Removing the torrent loses
			{missingVideos === 1 ? 'it' : 'them'}.
		</p>
	{/if}

	{#if torrent.libraryFiles.length > 0}
		<label
			class="flex cursor-pointer gap-3 rounded-lg bg-neutral-800/60 p-3 ring-1 ring-neutral-800 transition-colors hover:bg-neutral-800"
		>
			<input
				type="checkbox"
				bind:checked={alsoLibrary}
				class="mt-0.5 h-4 w-4 flex-shrink-0 accent-brick-600"
			/>
			<div class="min-w-0 flex-1">
				<p class="text-neutral-200">
					Also delete the library copy ({torrent.libraryFiles.length} file{torrent.libraryFiles
						.length === 1
						? ''
						: 's'}, {formatBytes(libraryBytes)})
				</p>
				<p class="mt-0.5 text-[11px] text-neutral-500">Removes it from Jellyfin.</p>
				<ul class="mt-2 space-y-0.5">
					{#each torrent.libraryFiles as f (f.path)}
						<li class="truncate text-[11px] text-neutral-500" title={f.path}>{f.path}</li>
					{/each}
				</ul>
			</div>
		</label>
	{/if}

	{#if error}
		<p class="rounded-lg bg-brick-900/20 p-3 text-xs text-brick-400">{error}</p>
	{/if}

	{#snippet footer()}
		<button
			type="button"
			onclick={onClose}
			class="rounded-full px-4 py-2 text-sm text-neutral-300 transition-colors hover:bg-neutral-800"
		>
			Cancel
		</button>
		<button
			type="button"
			onclick={confirm}
			disabled={deleting}
			class="rounded-full bg-brick-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brick-500 disabled:opacity-50"
		>
			{deleting
				? 'Removing…'
				: `Remove ${formatBytes(torrent.size + (alsoLibrary ? libraryBytes : 0))}`}
		</button>
	{/snippet}
</Modal>
