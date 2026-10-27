<script lang="ts">
	/**
	 * Delete a show, season or movie from the library, optionally removing the
	 * torrents its files were copied from.
	 */
	import Modal from './Modal.svelte';
	import TlStatus from './TlStatus.svelte';
	import type { StorageNode, StorageTorrent } from '$lib/types';
	import { formatBytes } from '$lib/format';
	import { deleteStorage, isUnder, torrentsLinkedTo, type DeleteResult } from '$lib/storage';

	interface Props {
		node: StorageNode;
		ancestors: StorageNode[];
		torrents: StorageTorrent[];
		onClose: () => void;
		onDeleted: (result: DeleteResult) => void;
	}

	let { node: initialNode, ancestors, torrents, onClose, onDeleted }: Props = $props();

	// A season can be widened to its whole show from inside the modal
	// svelte-ignore state_referenced_locally
	let node = $state(initialNode);
	const parentShow = $derived(
		node.kind === 'season' ? ancestors.find((a) => a.kind === 'show') : undefined
	);

	const path = $derived(node.path ?? '');
	const linked = $derived(path ? torrentsLinkedTo(path, torrents) : []);

	// Safe torrents start ticked; risky ones need an explicit choice
	let chosen = $state(new Set<string>());
	$effect(() => {
		chosen = new Set(linked.filter((t) => t.tl?.safe).map((t) => t.hash));
	});

	let deleting = $state(false);
	let error = $state<string | null>(null);

	const torrentBytes = $derived(
		linked.filter((t) => chosen.has(t.hash)).reduce((s, t) => s + t.size, 0)
	);

	/** Folders outside this node that a torrent also has library copies in */
	function otherFolders(t: StorageTorrent): string[] {
		const dirs = t.libraryFiles
			.filter((f) => !isUnder(f.path, path))
			.map((f) => f.path.split('/').slice(1, -1).join(' › '));
		return [...new Set(dirs)];
	}

	function toggle(hash: string) {
		const next = new Set(chosen);
		if (next.has(hash)) next.delete(hash);
		else next.add(hash);
		chosen = next;
	}

	async function confirm() {
		deleting = true;
		error = null;
		try {
			const result = await deleteStorage({ paths: [path], torrents: [...chosen] });
			onDeleted(result);
		} catch (e) {
			error = e instanceof Error ? e.message : 'Delete failed';
			deleting = false;
		}
	}

	const title = $derived(
		node.kind === 'season' && parentShow ? `${parentShow.name} — ${node.name}` : node.name
	);
</script>

<Modal title="Delete {title}" subtitle="{path} · {formatBytes(node.size)}" {onClose}>
	<p class="text-neutral-300">
		This permanently deletes the files from the library. Jellyfin will be told to rescan.
	</p>

	{#if parentShow}
		<button
			type="button"
			onclick={() => (node = parentShow)}
			class="text-xs text-gold-400 transition-colors hover:text-gold-300"
		>
			Delete the whole show ({formatBytes(parentShow.size)}) instead
		</button>
	{/if}

	<div>
		<h3 class="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
			Torrents these files came from
		</h3>
		{#if linked.length === 0}
			<p class="text-xs text-neutral-500">
				No torrent in qBittorrent has these files. They may have been downloaded before tv-thing, or
				their torrent was already removed.
			</p>
		{:else}
			<ul class="space-y-2">
				{#each linked as t (t.hash)}
					{@const others = otherFolders(t)}
					<li>
						<label
							class="flex cursor-pointer gap-3 rounded-lg bg-neutral-800/60 p-3 ring-1 ring-neutral-800 transition-colors hover:bg-neutral-800"
						>
							<input
								type="checkbox"
								checked={chosen.has(t.hash)}
								onchange={() => toggle(t.hash)}
								class="mt-0.5 h-4 w-4 flex-shrink-0 accent-brick-600"
							/>
							<div class="min-w-0 flex-1 space-y-1.5">
								<p class="text-xs break-words text-neutral-200">{t.name}</p>
								<div class="flex flex-wrap items-center gap-2">
									<TlStatus tl={t.tl} detailed />
									<span class="text-[11px] text-neutral-500">{formatBytes(t.size)}</span>
								</div>
								{#if t.tl && !t.tl.safe}
									<p class="text-[11px] text-ember-400/80">
										Removing it now becomes a hit-and-run unless you clear it with TL points.
									</p>
								{/if}
								{#if others.length > 0}
									<p class="text-[11px] text-neutral-500">
										Also contains files for {others.join(', ')} — those library copies are kept.
									</p>
								{/if}
							</div>
						</label>
					</li>
				{/each}
			</ul>
			<p class="mt-2 text-[11px] text-neutral-500">
				Ticked torrents are removed from qBittorrent along with their downloaded files.
			</p>
		{/if}
	</div>

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
			disabled={deleting || !path}
			class="rounded-full bg-brick-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brick-500 disabled:opacity-50"
		>
			{deleting ? 'Deleting…' : `Delete ${formatBytes(node.size + torrentBytes)}`}
		</button>
	{/snippet}
</Modal>
