/**
 * Library scanner
 *
 * Checks if media has already been downloaded by scanning:
 * 1. The Jellyfin media directory structure
 * 2. Active/seeding torrents in qBittorrent
 *
 * Results are cached briefly to avoid hammering the filesystem.
 */

import { env } from './env.js';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { getTorrents } from './qbittorrent-client.js';

// ─── Cache ────────────────────────────────────────────────────────────────────

interface LibraryIndex {
	/** Lowercase movie folder names (e.g., "inception (2010)") */
	movies: Set<string>;
	/** Lowercase TV show folder names (e.g., "breaking bad") */
	tvShows: Set<string>;
	/** Lowercase TV show -> set of season numbers */
	tvSeasons: Map<string, Set<number>>;
	/** Lowercase torrent names currently in qBittorrent */
	torrentNames: Set<string>;
	/** When this index was built */
	builtAt: number;
}

let cachedIndex: LibraryIndex | null = null;
const CACHE_TTL = 30_000; // 30 seconds

// ─── Scanning ─────────────────────────────────────────────────────────────────

/**
 * Build the library index by scanning media directories and qBittorrent
 */
async function buildIndex(): Promise<LibraryIndex> {
	const index: LibraryIndex = {
		movies: new Set(),
		tvShows: new Set(),
		tvSeasons: new Map(),
		torrentNames: new Set(),
		builtAt: Date.now()
	};

	// Scan movies directory
	try {
		const movieDir = join(env.MEDIA_DIR, 'movies');
		const entries = await readdir(movieDir);
		for (const entry of entries) {
			index.movies.add(String(entry).toLowerCase());
		}
	} catch {
		// Directory may not exist yet
	}

	// Scan TV directory
	try {
		const tvDir = join(env.MEDIA_DIR, 'tv');
		const shows = await readdir(tvDir);
		for (const show of shows) {
			const showName = String(show).toLowerCase();
			index.tvShows.add(showName);

			// Scan seasons within each show
			try {
				const seasons = await readdir(join(tvDir, String(show)));
				const seasonNums = new Set<number>();
				for (const season of seasons) {
					const match = String(season).match(/season\s+(\d+)/i);
					if (match) {
						seasonNums.add(parseInt(match[1], 10));
					}
				}
				if (seasonNums.size > 0) {
					index.tvSeasons.set(showName, seasonNums);
				}
			} catch {
				// Skip inaccessible season dirs
			}
		}
	} catch {
		// Directory may not exist yet
	}

	// Scan qBittorrent torrents
	try {
		const torrents = await getTorrents();
		for (const t of torrents) {
			index.torrentNames.add(t.name.toLowerCase());
		}
	} catch {
		// qBittorrent may not be available
	}

	return index;
}

/**
 * Get the library index (cached for 30 seconds)
 */
async function getIndex(): Promise<LibraryIndex> {
	if (cachedIndex && Date.now() - cachedIndex.builtAt < CACHE_TTL) {
		return cachedIndex;
	}

	cachedIndex = await buildIndex();
	return cachedIndex;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Normalize a title for fuzzy matching
 */
function normalize(title: string): string {
	return title
		.toLowerCase()
		.replace(/['']/g, '')
		.replace(/[^a-z0-9\s]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Check if a movie has been downloaded
 */
export async function isMovieDownloaded(title: string, year?: number): Promise<boolean> {
	const index = await getIndex();
	const normalTitle = normalize(title);

	// Check media directory
	for (const folder of index.movies) {
		const normalFolder = normalize(folder);
		if (year) {
			// Match "title (year)" pattern
			if (normalFolder.includes(normalTitle) && folder.includes(String(year))) {
				return true;
			}
		} else {
			if (normalFolder.includes(normalTitle)) {
				return true;
			}
		}
	}

	// Check qBittorrent torrents
	for (const name of index.torrentNames) {
		const normalName = normalize(name);
		if (normalName.includes(normalTitle)) {
			if (!year || name.includes(String(year))) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Check if a TV show has been downloaded (any season)
 */
export async function isTvShowDownloaded(title: string): Promise<boolean> {
	const index = await getIndex();
	const normalTitle = normalize(title);

	// Check media directory
	for (const show of index.tvShows) {
		if (normalize(show).includes(normalTitle)) {
			return true;
		}
	}

	// Check qBittorrent torrents
	for (const name of index.torrentNames) {
		if (normalize(name).includes(normalTitle)) {
			return true;
		}
	}

	return false;
}

/**
 * Check if a specific season of a TV show has been downloaded
 */
export async function isTvSeasonDownloaded(title: string, season: number): Promise<boolean> {
	const index = await getIndex();
	const normalTitle = normalize(title);

	// Check media directory
	for (const [show, seasons] of index.tvSeasons) {
		if (normalize(show).includes(normalTitle) && seasons.has(season)) {
			return true;
		}
	}

	// Check qBittorrent for season packs
	const seasonStr = `s${String(season).padStart(2, '0')}`;
	for (const name of index.torrentNames) {
		const normalName = normalize(name);
		if (normalName.includes(normalTitle) && name.toLowerCase().includes(seasonStr)) {
			return true;
		}
	}

	return false;
}

/**
 * Batch check: given a list of TMDB results, return which ones are downloaded
 */
export async function checkDownloaded(
	items: { id: number; title: string; mediaType: 'movie' | 'tv'; year?: number }[]
): Promise<Record<number, boolean>> {
	const results: Record<number, boolean> = {};

	for (const item of items) {
		if (item.mediaType === 'movie') {
			results[item.id] = await isMovieDownloaded(item.title, item.year);
		} else {
			results[item.id] = await isTvShowDownloaded(item.title);
		}
	}

	return results;
}
