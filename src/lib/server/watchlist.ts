/**
 * Watch list
 *
 * Titles the user wants, stored in $DATA_DIR/watchlist.json. Items are
 * dropped automatically once Jellyfin has them (matched by TMDB ID).
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from './env.js';
import { getLibraryItems, isJellyfinConfigured } from './jellyfin-client.js';
import type { WatchlistItem } from '$lib/types.js';

const file = () => join(env.DATA_DIR, 'watchlist.json');

/** Serialises read-modify-write cycles so concurrent requests can't lose updates */
let queue: Promise<unknown> = Promise.resolve();

function exclusive<T>(fn: () => Promise<T>): Promise<T> {
	const run = queue.then(fn, fn);
	queue = run.catch(() => {});
	return run;
}

async function load(): Promise<WatchlistItem[]> {
	try {
		return JSON.parse(await readFile(file(), 'utf8'));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
		throw err;
	}
}

/** Write via a temp file + rename so a crash can't leave a half-written list */
async function save(items: WatchlistItem[]): Promise<void> {
	await mkdir(env.DATA_DIR, { recursive: true });
	const tmp = `${file()}.tmp`;
	await writeFile(tmp, JSON.stringify(items, null, '\t'));
	await rename(tmp, file());
}

const sameItem = (a: Pick<WatchlistItem, 'tmdbId' | 'mediaType'>, b: typeof a) =>
	a.tmdbId === b.tmdbId && a.mediaType === b.mediaType;

/** TMDB IDs Jellyfin has, keyed "movie:123" / "tv:456". Null if Jellyfin can't be reached. */
async function libraryKeys(): Promise<Set<string> | null> {
	if (!isJellyfinConfigured()) return null;
	try {
		const items = await getLibraryItems('all');
		return new Set(
			items.filter((i) => i.tmdbId).map((i) => `${i.type === 'Movie' ? 'movie' : 'tv'}:${i.tmdbId}`)
		);
	} catch (err) {
		console.warn('[watchlist] Jellyfin check failed:', err);
		return null;
	}
}

/**
 * Get the watch list, removing anything that has arrived in the library.
 * Returns the removed items so the UI can say so.
 */
export function getWatchlist(): Promise<{ items: WatchlistItem[]; arrived: WatchlistItem[] }> {
	return exclusive(async () => {
		const items = await load();
		const inLibrary = await libraryKeys();
		if (!inLibrary) return { items, arrived: [] };

		const arrived = items.filter((i) => inLibrary.has(`${i.mediaType}:${i.tmdbId}`));
		if (arrived.length === 0) return { items, arrived };

		const remaining = items.filter((i) => !arrived.includes(i));
		await save(remaining);
		console.log(`[watchlist] Arrived in library: ${arrived.map((i) => i.title).join(', ')}`);
		return { items: remaining, arrived };
	});
}

export class AlreadyInLibraryError extends Error {}

export function addToWatchlist(item: Omit<WatchlistItem, 'addedAt'>): Promise<WatchlistItem[]> {
	return exclusive(async () => {
		const inLibrary = await libraryKeys();
		if (inLibrary?.has(`${item.mediaType}:${item.tmdbId}`)) {
			throw new AlreadyInLibraryError(`${item.title} is already in your library`);
		}

		const items = await load();
		if (items.some((i) => sameItem(i, item))) return items;

		const next = [{ ...item, addedAt: Date.now() }, ...items];
		await save(next);
		return next;
	});
}

export function removeFromWatchlist(
	key: Pick<WatchlistItem, 'tmdbId' | 'mediaType'>
): Promise<WatchlistItem[]> {
	return exclusive(async () => {
		const items = await load();
		const next = items.filter((i) => !sameItem(i, key));
		if (next.length !== items.length) await save(next);
		return next;
	});
}
