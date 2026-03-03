/**
 * Jellyfin API client
 *
 * Fetches media library items from a Jellyfin server.
 * Uses API key auth and caches results to avoid hammering the server.
 */

import { env } from './env.js';
import type { JellyfinItem } from '$lib/types.js';

// ─── Cache ────────────────────────────────────────────────────────────────────

interface LibraryCache {
	movies: JellyfinItem[];
	tvshows: JellyfinItem[];
	builtAt: number;
}

let cache: LibraryCache | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─── Library folder IDs (discovered once, then cached permanently) ────────────

interface LibraryFolders {
	moviesId: string | null;
	tvshowsId: string | null;
}

let libraryFolders: LibraryFolders | null = null;

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async function jellyfinFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
	if (!env.JELLYFIN_URL || !env.JELLYFIN_API_KEY) {
		throw new Error('JELLYFIN_URL and JELLYFIN_API_KEY are required');
	}

	const url = new URL(`${env.JELLYFIN_URL.replace(/\/$/, '')}${path}`);
	url.searchParams.set('api_key', env.JELLYFIN_API_KEY);
	for (const [k, v] of Object.entries(params)) {
		url.searchParams.set(k, v);
	}

	const res = await fetch(url.toString(), {
		headers: { Accept: 'application/json' }
	});

	if (!res.ok) {
		throw new Error(`Jellyfin API error ${res.status}: ${path}`);
	}

	return res.json() as Promise<T>;
}

// ─── Library folder discovery ─────────────────────────────────────────────────

interface JellyfinMediaFolder {
	Id: string;
	Name: string;
	CollectionType?: string;
}

async function getLibraryFolders(): Promise<LibraryFolders> {
	if (libraryFolders) return libraryFolders;

	const data = await jellyfinFetch<{ Items: JellyfinMediaFolder[] }>('/Library/MediaFolders');

	let moviesId: string | null = null;
	let tvshowsId: string | null = null;

	for (const folder of data.Items) {
		if (folder.CollectionType === 'movies') moviesId = folder.Id;
		else if (folder.CollectionType === 'tvshows') tvshowsId = folder.Id;
	}

	libraryFolders = { moviesId, tvshowsId };
	return libraryFolders;
}

// ─── Item fetching ────────────────────────────────────────────────────────────

interface JellyfinRawItem {
	Id: string;
	Name: string;
	ProductionYear?: number;
	Type: string;
	ImageTags?: { Primary?: string };
	ProviderIds?: { Tmdb?: string; Imdb?: string };
}

async function fetchItemsForLibrary(
	parentId: string,
	type: 'Movie' | 'Series'
): Promise<JellyfinItem[]> {
	const data = await jellyfinFetch<{ Items: JellyfinRawItem[]; TotalRecordCount: number }>(
		'/Items',
		{
			ParentId: parentId,
			IncludeItemTypes: type,
			Fields: 'ProviderIds,ImageTags',
			SortBy: 'SortName',
			SortOrder: 'Ascending',
			Recursive: 'false',
			Limit: '500'
		}
	);

	return data.Items.map((item) => ({
		id: item.Id,
		name: item.Name,
		year: item.ProductionYear,
		type: type,
		tmdbId: item.ProviderIds?.Tmdb,
		imdbId: item.ProviderIds?.Imdb,
		imageUrl: `/api/library/image/${item.Id}`,
		hasPoster: !!item.ImageTags?.Primary
	}));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Whether Jellyfin is configured */
export function isJellyfinConfigured(): boolean {
	return !!(env.JELLYFIN_URL && env.JELLYFIN_API_KEY);
}

/** Get all library items, optionally filtered by type */
export async function getLibraryItems(
	type: 'movies' | 'tvshows' | 'all' = 'all'
): Promise<JellyfinItem[]> {
	if (!isJellyfinConfigured()) return [];

	// Return cached if fresh
	if (cache && Date.now() - cache.builtAt < CACHE_TTL) {
		if (type === 'movies') return cache.movies;
		if (type === 'tvshows') return cache.tvshows;
		return [...cache.movies, ...cache.tvshows].sort((a, b) => a.name.localeCompare(b.name));
	}

	// Rebuild cache
	const folders = await getLibraryFolders();

	const [movies, tvshows] = await Promise.all([
		folders.moviesId ? fetchItemsForLibrary(folders.moviesId, 'Movie') : Promise.resolve([]),
		folders.tvshowsId ? fetchItemsForLibrary(folders.tvshowsId, 'Series') : Promise.resolve([])
	]);

	cache = { movies, tvshows, builtAt: Date.now() };

	if (type === 'movies') return movies;
	if (type === 'tvshows') return tvshows;
	return [...movies, ...tvshows].sort((a, b) => a.name.localeCompare(b.name));
}

/** Invalidate the library cache (call after a download completes) */
export function invalidateLibraryCache(): void {
	cache = null;
}

/**
 * Check if a TMDB item exists in the Jellyfin library.
 * Returns true if a matching item is found by TMDB ID.
 * Falls back to fuzzy name matching if no TMDB ID is provided.
 */
export async function isInJellyfinLibrary(opts: {
	tmdbId?: string | number;
	title?: string;
	mediaType: 'movie' | 'tv';
	seasonNumber?: number;
}): Promise<boolean> {
	if (!isJellyfinConfigured()) return false;

	const { tmdbId, title, mediaType, seasonNumber } = opts;

	try {
		const type = mediaType === 'movie' ? 'movies' : 'tvshows';
		const items = await getLibraryItems(type);

		// Find the matching show/movie — prefer TMDB ID, fall back to name
		let matchedItem: JellyfinItem | undefined;

		if (tmdbId !== undefined) {
			const idStr = String(tmdbId);
			matchedItem = items.find((i) => i.tmdbId === idStr);
		}

		if (!matchedItem && title) {
			const normalTarget = title
				.toLowerCase()
				.replace(/[^a-z0-9\s]/g, '')
				.replace(/\s+/g, ' ')
				.trim();
			matchedItem = items.find((i) => {
				const normalName = i.name
					.toLowerCase()
					.replace(/[^a-z0-9\s]/g, '')
					.replace(/\s+/g, ' ')
					.trim();
				return (
					normalName === normalTarget ||
					normalName.includes(normalTarget) ||
					normalTarget.includes(normalName)
				);
			});
		}

		if (!matchedItem) return false;

		// For movies or show-level TV checks, found = downloaded
		if (mediaType === 'movie' || seasonNumber === undefined) return true;

		// For season-level TV checks, query Jellyfin for the show's seasons
		const seasons = await jellyfinFetch<{ Items: { IndexNumber?: number }[] }>('/Items', {
			ParentId: matchedItem.id,
			IncludeItemTypes: 'Season',
			Fields: 'BasicSyncInfo',
			Recursive: 'false',
			Limit: '100'
		});

		return seasons.Items.some((s) => s.IndexNumber === seasonNumber);
	} catch {
		return false;
	}
}

/** Proxy a Jellyfin poster image — returns a Response with image bytes */
export async function proxyPosterImage(jellyfinId: string): Promise<Response> {
	if (!isJellyfinConfigured()) {
		return new Response(null, { status: 404 });
	}

	const url = new URL(`${env.JELLYFIN_URL.replace(/\/$/, '')}/Items/${jellyfinId}/Images/Primary`);
	url.searchParams.set('api_key', env.JELLYFIN_API_KEY);
	url.searchParams.set('maxHeight', '400');
	url.searchParams.set('quality', '90');

	try {
		const res = await fetch(url.toString());
		if (!res.ok) return new Response(null, { status: 404 });

		const contentType = res.headers.get('content-type') || 'image/jpeg';
		const body = await res.arrayBuffer();

		return new Response(body, {
			status: 200,
			headers: {
				'Content-Type': contentType,
				'Cache-Control': 'public, max-age=3600'
			}
		});
	} catch {
		return new Response(null, { status: 502 });
	}
}
