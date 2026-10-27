/**
 * TorrentLeech API client
 *
 * Handles session-based authentication and searching/downloading via
 * TorrentLeech's internal JSON API.
 */

import { env } from './env.js';
import type {
	TLEntry,
	TLSearchResponse,
	SearchResult,
	SearchCategory,
	SortBy,
	SortOrder,
	CATEGORY_MAP
} from '$lib/types.js';
import { CATEGORY_LABELS, TL_CATEGORIES } from '$lib/types.js';

const BASE_URL = 'https://www.torrentleech.org';
const MIN_REQUEST_INTERVAL = 4100; // ~4.1s between requests per Jackett's rate limit

/** Session cookies stored after login */
let sessionCookies: string = '';
let lastRequestTime = 0;

/**
 * Enforce rate limiting between requests
 */
async function rateLimit(): Promise<void> {
	const now = Date.now();
	const elapsed = now - lastRequestTime;
	if (elapsed < MIN_REQUEST_INTERVAL) {
		await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL - elapsed));
	}
	lastRequestTime = Date.now();
}

/**
 * Login to TorrentLeech and store session cookies
 */
async function login(): Promise<void> {
	if (!env.TL_USERNAME || !env.TL_PASSWORD) {
		throw new Error('TL_USERNAME and TL_PASSWORD environment variables are required');
	}

	console.log('[tl-client] Logging in...');

	const body = new URLSearchParams({
		username: env.TL_USERNAME,
		password: env.TL_PASSWORD
	});

	if (env.TL_2FA_TOKEN) {
		body.set('alt2FAToken', env.TL_2FA_TOKEN);
	}

	const response = await fetch(`${BASE_URL}/user/account/login/`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15'
		},
		body,
		redirect: 'manual' // Don't follow redirects, we just want the cookies
	});

	// Extract cookies from Set-Cookie headers
	const cookies: string[] = [];
	response.headers.forEach((value, key) => {
		if (key.toLowerCase() === 'set-cookie') {
			const cookiePart = value.split(';')[0];
			if (cookiePart) cookies.push(cookiePart);
		}
	});

	if (cookies.length === 0) {
		// Try to read the response to see if there's an error
		const text = await response.text();
		throw new Error(
			`TorrentLeech login failed: no session cookies received. Status: ${response.status}`
		);
	}

	sessionCookies = cookies.join('; ');
	console.log('[tl-client] Logged in successfully');
}

/**
 * Ensure we have a valid session, re-login if needed
 */
async function ensureAuth(): Promise<void> {
	if (!sessionCookies) {
		await login();
	}
}

/**
 * Make an authenticated request to TorrentLeech
 */
async function tlFetch(url: string, options: RequestInit = {}): Promise<Response> {
	await ensureAuth();
	await rateLimit();

	const response = await fetch(url, {
		...options,
		headers: {
			Cookie: sessionCookies,
			'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
			Accept: 'application/json',
			...((options.headers as Record<string, string>) || {})
		},
		redirect: 'manual'
	});

	// If we get a redirect to login, session expired — re-login and retry
	if (response.status === 301 || response.status === 302 || response.status === 303) {
		const location = response.headers.get('location') || '';
		if (location.includes('login') || location.includes('account')) {
			console.log('[tl-client] Session expired, re-logging in...');
			sessionCookies = '';
			await login();
			await rateLimit();
			return fetch(url, {
				...options,
				headers: {
					Cookie: sessionCookies,
					'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
					Accept: 'application/json',
					...((options.headers as Record<string, string>) || {})
				}
			});
		}
	}

	return response;
}

/**
 * Determine the SearchCategory from a TorrentLeech categoryID
 */
function categoryFromId(categoryID: number): SearchCategory {
	const tvEpisodeIds: number[] = [
		TL_CATEGORIES.TV_EPISODES_SD,
		TL_CATEGORIES.TV_EPISODES_HD,
		TL_CATEGORIES.TV_FOREIGN,
		TL_CATEGORIES.TV_ANIME,
		TL_CATEGORIES.TV_CARTOONS
	];
	if (tvEpisodeIds.includes(categoryID)) return 'tv-episodes';
	if (categoryID === TL_CATEGORIES.TV_BOXSETS) return 'tv-boxsets';
	if (categoryID === TL_CATEGORIES.DOCUMENTARIES) return 'documentaries';
	return 'movies';
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Parse a raw TorrentLeech entry into our SearchResult format
 */
function parseTLEntry(entry: TLEntry): SearchResult {
	const category = categoryFromId(entry.categoryID);
	return {
		id: entry.fid,
		title: entry.name,
		name: entry.name,
		category,
		categoryName: CATEGORY_LABELS[category],
		size: entry.size,
		sizeFormatted: formatBytes(entry.size),
		seeders: entry.seeders,
		leechers: entry.leechers,
		completed: entry.completed,
		freeleech: entry.download_multiplier === 0,
		added: entry.addedTimestamp,
		filename: entry.filename,
		imdbID: entry.imdbID || '',
		tags: entry.tags || ''
	};
}

/**
 * Search TorrentLeech
 *
 * @param query - Search query string
 * @param categoryIds - Comma-separated TL category IDs to filter by
 * @param sortBy - Sort field
 * @param sortOrder - Sort direction
 * @param imdbId - Optional IMDB ID to filter by (e.g., "tt1234567")
 */
export async function search(
	query: string,
	categoryIds: number[],
	sortBy: SortBy = 'seeders',
	sortOrder: SortOrder = 'desc',
	imdbId?: string
): Promise<{ results: SearchResult[]; total: number }> {
	// Build the URL path segments
	const parts: string[] = ['/torrents/browse/list'];

	if (categoryIds.length > 0) {
		parts.push(`categories/${categoryIds.join(',')}`);
	}

	if (query.trim()) {
		parts.push(`query/${encodeURIComponent(query.trim())}`);
	}

	if (imdbId?.trim()) {
		parts.push(`imdbID/${encodeURIComponent(imdbId.trim())}`);
	}

	parts.push(`orderby/${sortBy}`);
	parts.push(`order/${sortOrder}`);

	const url = `${BASE_URL}${parts.join('/')}`;
	console.log(`[tl-client] Searching: ${url}`);

	const response = await tlFetch(url);

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`TorrentLeech search failed: ${response.status} ${text.slice(0, 200)}`);
	}

	const data: TLSearchResponse = await response.json();

	const results = (data.torrentList || []).map(parseTLEntry);

	return {
		results,
		total: data.numFound || results.length
	};
}

/**
 * Download a .torrent file from TorrentLeech
 *
 * @param fid - Torrent file ID
 * @param filename - Torrent filename
 * @returns Buffer containing the .torrent file
 */
export async function downloadTorrentFile(fid: number, filename: string): Promise<Buffer> {
	const url = `${BASE_URL}/download/${fid}/${encodeURIComponent(filename)}`;
	console.log(`[tl-client] Downloading torrent: ${fid}`);

	const response = await tlFetch(url, {
		headers: {
			Accept: 'application/x-bittorrent'
		}
	});

	if (!response.ok) {
		throw new Error(`Failed to download torrent ${fid}: ${response.status} ${response.statusText}`);
	}

	const arrayBuffer = await response.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	// Sanity check: .torrent files start with 'd' (bencode dictionary)
	if (buffer.length < 10 || buffer[0] !== 0x64) {
		throw new Error(
			`Downloaded file doesn't look like a .torrent (${buffer.length} bytes, starts with 0x${buffer[0]?.toString(16)})`
		);
	}

	return buffer;
}

// ─── Snatchlist (seeding / hit-and-run status) ────────────────────────────────

/** One row of the user's TL snatchlist */
export interface TLSnatch {
	tlId: number;
	name: string;
	size: number;
	ratio: number;
	seedSeconds: number;
	onHnrList: boolean;
}

const SNATCHLIST_TTL = 5 * 60_000;
const HNR_RULE_TTL = 24 * 60 * 60_000;
const DEFAULT_REQUIRED_HOURS = 168;

let snatchCache: { entries: TLSnatch[]; fetchedAt: number } | null = null;
let hnrRuleCache: { hours: number; fetchedAt: number } | null = null;

async function fetchProfilePage(page: string): Promise<string> {
	const url = `${BASE_URL}/profile/${encodeURIComponent(env.TL_USERNAME)}/${page}`;
	const response = await tlFetch(url, { headers: { Accept: 'text/html' } });
	if (!response.ok) {
		throw new Error(`Failed to fetch TL ${page}: ${response.status}`);
	}
	return response.text();
}

/**
 * Parse the snatchlist table. Each row carries machine-readable values in
 * data-sort attributes (bytes, seconds) alongside the display text.
 */
function parseSnatchlist(html: string): TLSnatch[] {
	const tbody = html.match(/<th[^>]*>Name<\/th>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/i)?.[1] ?? '';
	const entries: TLSnatch[] = [];

	for (const row of tbody.split(/<tr>/i).slice(1)) {
		const id = row.match(/class="torrent_name"[^>]*href="\/torrent\/(\d+)"/)?.[1];
		const name = row.match(/<td data-sort="([^"]*)"/)?.[1];
		const size = row.match(/<\/td>\s*<td data-sort="(\d+)">/)?.[1];
		const ratio = row.match(/title="Ratio">([^<]*)</)?.[1];
		const seed = row.match(/data-sort="(\d+)" title="Seeding Time"/)?.[1];
		const hnr = row.match(/title="Contained in HitnRUn list">([^<]*)</)?.[1];
		if (!id || !size) continue;

		entries.push({
			tlId: Number(id),
			name: name ?? '',
			size: Number(size),
			ratio: parseFloat(ratio ?? '0') || 0,
			seedSeconds: Number(seed ?? 0),
			onHnrList: hnr?.trim().toLowerCase() === 'yes'
		});
	}

	return entries;
}

/** Get the user's snatchlist (cached for 5 minutes) */
export async function getSnatchlist(force = false): Promise<TLSnatch[]> {
	if (!force && snatchCache && Date.now() - snatchCache.fetchedAt < SNATCHLIST_TTL) {
		return snatchCache.entries;
	}
	const entries = parseSnatchlist(await fetchProfilePage('snatchlist'));
	snatchCache = { entries, fetchedAt: Date.now() };
	return entries;
}

/**
 * Minimum seeding hours before a torrent can't become a hit-and-run.
 * Read from the H&R page ("Seed the torrent for 168 Hours"), cached for a day.
 */
export async function getRequiredSeedHours(): Promise<number> {
	if (hnrRuleCache && Date.now() - hnrRuleCache.fetchedAt < HNR_RULE_TTL) {
		return hnrRuleCache.hours;
	}
	let hours = DEFAULT_REQUIRED_HOURS;
	try {
		const match = (await fetchProfilePage('hnr')).match(/Seed the torrent for (\d+) Hours/i);
		if (match) hours = Number(match[1]);
	} catch (err) {
		console.warn('[tl-client] Could not read H&R rule, using default:', err);
	}
	hnrRuleCache = { hours, fetchedAt: Date.now() };
	return hours;
}
