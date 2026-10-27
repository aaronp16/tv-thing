<script lang="ts">
	/**
	 * Bulk-remove finished torrents: TL-safe and fully copied into the library.
	 * Library copies are kept.
	 */
	import Modal from './Modal.svelte';
	import TlStatus from './TlStatus.svelte';
	import type { StorageTorrent } from '$lib/types';
	import { formatBytes } from '$lib/format';
	import { deleteStorage, isCleanupCandidate, type DeleteResult } from '$lib/storage';

	interface Props {
		torrents: StorageTorrent[];
		onClose: () => void;
		onDeleted: (result: DeleteResult) => void;
	}

	let { torrents, onClose, onDeleted }: Props = $props();

	const candidates = $derived(torrents.filter(isCleanupCandidate).sort((a, b) => b.size - a.size));
	const notSafe = $derived(torrents.filter((t) => t.tl && !t.tl.safe).length);
	const notInLibrary = $derived(
		torrents.filter((t) => t.tl?.safe && t.linkedVideoFiles < t.videoFiles).length
	);

	let chosen = $state(new Set<string>());
	$effect(() => {
		chosen = new Set(candidates.map((t) => t.hash));
	});

	const chosenBytes = $derived(
		candidates.filter((t) => chosen.has(t.hash)).reduce((s, t) => s + t.size, 0)
	);

	let deleting = $state(false);
	let error = $state<string | null>(null);

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
			onDeleted(await deleteStorage({ torrents: [...chosen] }));
		} catch (e) {
			error = e instanceof Error ? e.message : 'Cleanup failed';
			deleting = false;
		}
	}
</script>

<Modal
	title="Clean up finished torrents"
	subtitle="Seeded long enough on TorrentLeech, and every video is already in the library"
	{onClose}
>
	{#if candidates.length === 0}
		<p class="text-neutral-400">Nothing to clean up right now.</p>
	{:else}
		<p class="text-neutral-300">
			These torrents are removed from qBittorrent with their downloaded files. Library copies are
			kept.
		</p>
		<ul class="space-y-1.5">
			{#each candidates as t (t.hash)}
				<li>
					<label
						class="flex cursor-pointer items-start gap-3 rounded-lg bg-neutral-800/60 px-3 py-2 ring-1 ring-neutral-800 transition-colors hover:bg-neutral-800"
					>
						<input
							type="checkbox"
							checked={chosen.has(t.hash)}
							onchange={() => toggle(t.hash)}
							class="mt-0.5 h-4 w-4 flex-shrink-0 accent-brick-600"
						/>
						<div class="min-w-0 flex-1">
							<p class="truncate text-xs text-neutral-200" title={t.name}>{t.name}</p>
							<div class="mt-1 flex items-center gap-2">
								<TlStatus tl={t.tl} detailed />
								<span class="text-[11px] text-neutral-500">{formatBytes(t.size)}</span>
							</div>
						</div>
					</label>
				</li>
			{/each}
		</ul>
	{/if}

	{#if notSafe > 0 || notInLibrary > 0}
		<p class="text-[11px] text-neutral-500">
			Not listed:{#if notSafe > 0}
				{notSafe} not seeded long enough yet{/if}{#if notSafe > 0 && notInLibrary > 0},{/if}{#if notInLibrary > 0}
				{notInLibrary} with files missing from the library{/if}. Click a tile on the map to remove
			one anyway.
		</p>
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
		{#if candidates.length > 0}
			<button
				type="button"
				onclick={confirm}
				disabled={deleting || chosen.size === 0}
				class="rounded-full bg-brick-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brick-500 disabled:opacity-50"
			>
				{deleting ? 'Removing…' : `Remove ${chosen.size} · ${formatBytes(chosenBytes)}`}
			</button>
		{/if}
	{/snippet}
</Modal>
