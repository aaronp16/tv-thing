/**
 * Watch list store — shared by the library panel and detail pages
 */

import { writable } from 'svelte/store';
import type { WatchlistItem } from '$lib/types';
import { toasts } from './toasts';

function createWatchlistStore() {
	const { subscribe, set } = writable<WatchlistItem[]>([]);
	let loaded = false;

	async function request(input: string, init?: RequestInit): Promise<WatchlistItem[]> {
		const res = await fetch(input, init);
		const data = await res.json();
		if (!res.ok) throw new Error(data.error || 'Watch list request failed');
		return data.items;
	}

	/** Reload, announcing anything that has arrived in the library */
	async function load(): Promise<void> {
		try {
			const res = await fetch('/api/watchlist');
			const data = await res.json();
			if (!res.ok) throw new Error(data.error || 'Failed to load watch list');
			set(data.items);
			loaded = true;
			for (const item of data.arrived as WatchlistItem[]) {
				toasts.success(`${item.title} is in your library — removed from watch list`, 6000);
			}
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Failed to load watch list');
		}
	}

	async function add(item: Omit<WatchlistItem, 'addedAt'>): Promise<void> {
		try {
			set(
				await request('/api/watchlist', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(item)
				})
			);
			toasts.success(`Added ${item.title} to watch list`);
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Failed to add to watch list');
		}
	}

	async function remove(
		item: Pick<WatchlistItem, 'tmdbId' | 'mediaType' | 'title'>
	): Promise<void> {
		try {
			const params = new URLSearchParams({
				tmdbId: String(item.tmdbId),
				mediaType: item.mediaType
			});
			set(await request(`/api/watchlist?${params}`, { method: 'DELETE' }));
			toasts.info(`Removed ${item.title} from watch list`);
		} catch (e) {
			toasts.error(e instanceof Error ? e.message : 'Failed to remove from watch list');
		}
	}

	/** Load once on first use */
	function ensureLoaded(): void {
		if (!loaded) load();
	}

	return { subscribe, load, add, remove, ensureLoaded };
}

export const watchlist = createWatchlistStore();
