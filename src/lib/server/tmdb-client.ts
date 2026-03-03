/**
 * TMDB (The Movie Database) API client
 *
 * Handles all communication with TMDB's v3 API for media discovery,
 * including search, movie/TV details, season info, and watch providers.
 * Uses Bearer token auth and includes a simple in-memory cache.
 */

import { env } from './env.js';
import type {
	TMDBSearchResult,
	TMDBMovieDetail,
	TMDBTvDetail,
	TMDBSeasonDetail
} from '$lib/types.js';

const BASE_URL = 'https://api.themoviedb.org/3';

// ─── Cache ────────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
	data: T;
	expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

const CACHE_TTL_SEARCH = 60 * 1000; // 1 minute
const CACHE_TTL_DETAIL = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
	const entry = cache.get(key);
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		cache.delete(key);
		return null;
	}
	return entry.data as T;
}

function setCache<T>(key: string, data: T, ttl: number): void {
	cache.set(key, { data, expiresAt: Date.now() + ttl });

	// Prune old entries periodically (keep cache under 500 entries)
	if (cache.size > 500) {
		const now = Date.now();
		for (const [k, v] of cache) {
			if (now > v.expiresAt) cache.delete(k);
		}
	}
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
	if (!env.TMDB_API_KEY) {
		throw new Error('TMDB_API_KEY environment variable is required for Discover features');
	}

	const url = new URL(`${BASE_URL}${path}`);
	url.searchParams.set('language', 'en-US');
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}

	// Support both v3 API key (short hex string) and v4 Read Access Token (long JWT/Bearer token).
	// If the key looks like a Bearer token (long, starts with "eyJ"), use Authorization header.
	// Otherwise, pass it as the api_key query parameter.
	const isBearer = env.TMDB_API_KEY.length > 64 || env.TMDB_API_KEY.startsWith('eyJ');

	const headers: Record<string, string> = { Accept: 'application/json' };
	if (isBearer) {
		headers['Authorization'] = `Bearer ${env.TMDB_API_KEY}`;
	} else {
		url.searchParams.set('api_key', env.TMDB_API_KEY);
	}

	const response = await fetch(url.toString(), { headers });

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`TMDB API error ${response.status}: ${text.slice(0, 300)}`);
	}

	return response.json() as Promise<T>;
}

// ─── Search ───────────────────────────────────────────────────────────────────

interface TMDBSearchResponse {
	page: number;
	total_pages: number;
	total_results: number;
	results: TMDBSearchResult[];
}

/**
 * Multi-search across movies, TV shows, and people
 */
export async function searchMulti(
	query: string,
	page: number = 1
): Promise<{ results: TMDBSearchResult[]; total: number; page: number; totalPages: number }> {
	const cacheKey = `search:${query}:${page}`;
	const cached = getCached<TMDBSearchResponse>(cacheKey);
	if (cached) {
		return {
			results: cached.results,
			total: cached.total_results,
			page: cached.page,
			totalPages: cached.total_pages
		};
	}

	const data = await tmdbFetch<TMDBSearchResponse>('/search/multi', {
		query,
		page: String(page),
		include_adult: 'false'
	});

	setCache(cacheKey, data, CACHE_TTL_SEARCH);

	// Filter out people results — we only want movies and TV shows
	const filtered = data.results.filter((r) => r.media_type === 'movie' || r.media_type === 'tv');

	return {
		results: filtered,
		total: data.total_results,
		page: data.page,
		totalPages: data.total_pages
	};
}

// ─── Trending ─────────────────────────────────────────────────────────────────

/**
 * Get trending movies, TV shows, or both.
 * Uses TMDB's /trending endpoint which returns the same shape as search results.
 */
export async function getTrending(
	mediaType: 'all' | 'movie' | 'tv' = 'all',
	timeWindow: 'day' | 'week' = 'week',
	page: number = 1
): Promise<{ results: TMDBSearchResult[]; total: number; page: number; totalPages: number }> {
	const cacheKey = `trending:${mediaType}:${timeWindow}:${page}`;
	const cached = getCached<TMDBSearchResponse>(cacheKey);
	if (cached) {
		return {
			results: cached.results,
			total: cached.total_results,
			page: cached.page,
			totalPages: cached.total_pages
		};
	}

	const data = await tmdbFetch<TMDBSearchResponse>(`/trending/${mediaType}/${timeWindow}`, {
		page: String(page)
	});

	setCache(cacheKey, data, CACHE_TTL_SEARCH);

	// Filter out people results if mediaType is 'all'
	const filtered = data.results.filter((r) => r.media_type === 'movie' || r.media_type === 'tv');

	return {
		results: filtered,
		total: data.total_results,
		page: data.page,
		totalPages: data.total_pages
	};
}

// ─── Movie Details ────────────────────────────────────────────────────────────

/**
 * Get full movie details including credits, watch providers, and external IDs
 */
export async function getMovieDetails(movieId: number): Promise<TMDBMovieDetail> {
	const cacheKey = `movie:${movieId}`;
	const cached = getCached<TMDBMovieDetail>(cacheKey);
	if (cached) return cached;

	const data = await tmdbFetch<TMDBMovieDetail>(`/movie/${movieId}`, {
		append_to_response: 'credits,watch/providers,external_ids'
	});

	setCache(cacheKey, data, CACHE_TTL_DETAIL);
	return data;
}

// ─── TV Details ───────────────────────────────────────────────────────────────

/**
 * Get full TV series details including credits, watch providers, external IDs, and content ratings
 */
export async function getTvDetails(seriesId: number): Promise<TMDBTvDetail> {
	const cacheKey = `tv:${seriesId}`;
	const cached = getCached<TMDBTvDetail>(cacheKey);
	if (cached) return cached;

	const data = await tmdbFetch<TMDBTvDetail>(`/tv/${seriesId}`, {
		append_to_response: 'credits,watch/providers,external_ids,content_ratings'
	});

	setCache(cacheKey, data, CACHE_TTL_DETAIL);
	return data;
}

// ─── Season Details ───────────────────────────────────────────────────────────

/**
 * Get full season details with episode list
 */
export async function getSeasonDetails(
	seriesId: number,
	seasonNumber: number
): Promise<TMDBSeasonDetail> {
	const cacheKey = `tv:${seriesId}:season:${seasonNumber}`;
	const cached = getCached<TMDBSeasonDetail>(cacheKey);
	if (cached) return cached;

	const data = await tmdbFetch<TMDBSeasonDetail>(`/tv/${seriesId}/season/${seasonNumber}`);

	setCache(cacheKey, data, CACHE_TTL_DETAIL);
	return data;
}

// ─── Watch Providers ──────────────────────────────────────────────────────────

/**
 * Extract watch providers for the configured region from a detail response.
 * This works with both movie and TV details that have watch/providers appended.
 */
export function extractWatchProviders(
	watchProviders:
		| {
				results: Record<
					string,
					{
						link?: string;
						flatrate?: unknown[];
						rent?: unknown[];
						buy?: unknown[];
						ads?: unknown[];
					}
				>;
		  }
		| undefined
): { flatrate: unknown[]; rent: unknown[]; buy: unknown[]; ads: unknown[]; link?: string } | null {
	if (!watchProviders?.results) return null;

	const region = env.TMDB_REGION;
	const regionData = watchProviders.results[region];
	if (!regionData) return null;

	return {
		flatrate: regionData.flatrate || [],
		rent: regionData.rent || [],
		buy: regionData.buy || [],
		ads: regionData.ads || [],
		link: regionData.link
	};
}
