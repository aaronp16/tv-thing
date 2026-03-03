/**
 * Shared types for tv-thing
 */

/** TorrentLeech category IDs */
export const TL_CATEGORIES = {
	// TV
	TV_EPISODES_SD: 26,
	TV_EPISODES_HD: 32,
	TV_BOXSETS: 27,
	TV_FOREIGN: 44,
	TV_ANIME: 34,
	TV_CARTOONS: 35,
	// Movies
	MOVIES_CAM: 8,
	MOVIES_TS: 9,
	MOVIES_DVDRIP: 11,
	MOVIES_WEBRIP: 37,
	MOVIES_HDRIP: 43,
	MOVIES_BLURAY_RIP: 14,
	MOVIES_DVDR: 12,
	MOVIES_BLURAY: 13,
	MOVIES_4K: 47,
	MOVIES_BOXSETS: 15,
	MOVIES_FOREIGN: 36,
	// Other
	DOCUMENTARIES: 29
} as const;

/** Search category filter the user selects */
export type SearchCategory = 'tv-episodes' | 'tv-boxsets' | 'movies' | 'documentaries';

/** Map search categories to TorrentLeech category IDs */
export const CATEGORY_MAP: Record<SearchCategory, number[]> = {
	'tv-episodes': [
		TL_CATEGORIES.TV_EPISODES_SD,
		TL_CATEGORIES.TV_EPISODES_HD,
		TL_CATEGORIES.TV_FOREIGN,
		TL_CATEGORIES.TV_ANIME,
		TL_CATEGORIES.TV_CARTOONS
	],
	'tv-boxsets': [TL_CATEGORIES.TV_BOXSETS],
	movies: [
		TL_CATEGORIES.MOVIES_CAM,
		TL_CATEGORIES.MOVIES_TS,
		TL_CATEGORIES.MOVIES_DVDRIP,
		TL_CATEGORIES.MOVIES_WEBRIP,
		TL_CATEGORIES.MOVIES_HDRIP,
		TL_CATEGORIES.MOVIES_BLURAY_RIP,
		TL_CATEGORIES.MOVIES_DVDR,
		TL_CATEGORIES.MOVIES_BLURAY,
		TL_CATEGORIES.MOVIES_4K,
		TL_CATEGORIES.MOVIES_BOXSETS,
		TL_CATEGORIES.MOVIES_FOREIGN
	],
	documentaries: [TL_CATEGORIES.DOCUMENTARIES]
};

/** Media type for library organization */
export type MediaType = 'tv' | 'movie';

/** Infer media type from search category */
export function mediaTypeFromCategory(cat: SearchCategory): MediaType {
	return cat === 'movies' || cat === 'documentaries' ? 'movie' : 'tv';
}

/** Category display labels */
export const CATEGORY_LABELS: Record<SearchCategory, string> = {
	'tv-episodes': 'TV Episodes',
	'tv-boxsets': 'TV Boxsets',
	movies: 'Movies',
	documentaries: 'Documentaries'
};

/** Raw entry from TorrentLeech API */
export interface TLEntry {
	fid: number;
	filename: string;
	name: string;
	addedTimestamp: string;
	categoryID: number;
	size: number;
	seeders: number;
	leechers: number;
	completed: number;
	new: boolean;
	rating: number;
	numComments: number;
	tags: string;
	imdbID: string;
	igdbID: string;
	tvmazeID: string;
	download_multiplier: number;
}

/** TorrentLeech search response */
export interface TLSearchResponse {
	numFound: number;
	torrentList: TLEntry[];
}

/** Parsed search result for the frontend */
export interface SearchResult {
	id: number;
	title: string;
	name: string;
	category: SearchCategory;
	categoryName: string;
	size: number;
	sizeFormatted: string;
	seeders: number;
	leechers: number;
	completed: number;
	freeleech: boolean;
	added: string;
	filename: string;
	imdbID: string;
	tags: string;
}

/** Sort options for TorrentLeech */
export type SortBy = 'added' | 'seeders' | 'size' | 'nameSort';
export type SortOrder = 'desc' | 'asc';

/** Torrent status */
export type TorrentStatus = 'downloading' | 'seeding' | 'paused' | 'error';

/** Active torrent info exposed to the frontend */
export interface TorrentInfo {
	infoHash: string;
	name: string;
	progress: number;
	downloadSpeed: number;
	uploadSpeed: number;
	numPeers: number;
	downloaded: number;
	uploaded: number;
	size: number;
	ratio: number;
	status: TorrentStatus;
	files: string[];
	addedAt: string;
}

/** Download job for SSE progress */
export interface DownloadJob {
	id: string;
	torrentId: number;
	title: string;
	mediaType: MediaType;
	infoHash?: string;
	status: 'fetching' | 'downloading' | 'copying' | 'complete' | 'error';
	progress: number;
	downloadSpeed: number;
	uploadSpeed: number;
	numPeers: number;
	error?: string;
}

// ─── TMDB Types ───────────────────────────────────────────────────────────────

/**
 * Combined movie + TV genre map from TMDB.
 * These IDs are stable and well-known — no API call needed.
 */
export const TMDB_GENRES: Record<number, string> = {
	// Movie genres
	28: 'Action',
	12: 'Adventure',
	16: 'Animation',
	35: 'Comedy',
	80: 'Crime',
	99: 'Documentary',
	18: 'Drama',
	10751: 'Family',
	14: 'Fantasy',
	36: 'History',
	27: 'Horror',
	10402: 'Music',
	9648: 'Mystery',
	10749: 'Romance',
	878: 'Sci-Fi',
	10770: 'TV Movie',
	53: 'Thriller',
	10752: 'War',
	37: 'Western',
	// TV-only genres (not already covered above)
	10759: 'Action & Adventure',
	10762: 'Kids',
	10763: 'News',
	10764: 'Reality',
	10765: 'Sci-Fi & Fantasy',
	10766: 'Soap',
	10767: 'Talk',
	10768: 'War & Politics'
};

/** TMDB image CDN base URL */
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

/** Helper to build TMDB image URLs */
export function tmdbImage(path: string | null | undefined, size: string = 'w500'): string | null {
	if (!path) return null;
	return `${TMDB_IMAGE_BASE}/${size}${path}`;
}

/** TMDB multi-search result item */
export interface TMDBSearchResult {
	id: number;
	media_type: 'movie' | 'tv' | 'person';
	title?: string; // movies
	name?: string; // tv shows / people
	original_title?: string;
	original_name?: string;
	overview?: string;
	poster_path: string | null;
	backdrop_path: string | null;
	profile_path?: string | null; // people
	vote_average: number;
	vote_count: number;
	release_date?: string; // movies
	first_air_date?: string; // tv
	genre_ids: number[];
	popularity: number;
	adult?: boolean;
	original_language?: string;
}

/** TMDB genre */
export interface TMDBGenre {
	id: number;
	name: string;
}

/** TMDB cast member */
export interface TMDBCastMember {
	id: number;
	name: string;
	character: string;
	profile_path: string | null;
	order: number;
	known_for_department?: string;
}

/** TMDB crew member */
export interface TMDBCrewMember {
	id: number;
	name: string;
	job: string;
	department: string;
	profile_path: string | null;
}

/** TMDB watch provider */
export interface TMDBWatchProvider {
	provider_id: number;
	provider_name: string;
	logo_path: string;
	display_priority: number;
}

/** TMDB watch provider data for a region */
export interface TMDBWatchProviderRegion {
	link?: string;
	flatrate?: TMDBWatchProvider[];
	rent?: TMDBWatchProvider[];
	buy?: TMDBWatchProvider[];
	ads?: TMDBWatchProvider[];
}

/** TMDB season summary (from TV details) */
export interface TMDBSeasonSummary {
	id: number;
	season_number: number;
	name: string;
	overview: string;
	poster_path: string | null;
	air_date: string | null;
	episode_count: number;
	vote_average: number;
}

/** TMDB episode */
export interface TMDBEpisode {
	id: number;
	episode_number: number;
	season_number: number;
	name: string;
	overview: string;
	air_date: string | null;
	still_path: string | null;
	runtime: number | null;
	vote_average: number;
	vote_count: number;
}

/** TMDB season detail (full episode list) */
export interface TMDBSeasonDetail {
	id: number;
	season_number: number;
	name: string;
	overview: string;
	poster_path: string | null;
	air_date: string | null;
	episodes: TMDBEpisode[];
}

/** TMDB production company */
export interface TMDBProductionCompany {
	id: number;
	name: string;
	logo_path: string | null;
	origin_country: string;
}

/** TMDB network (for TV) */
export interface TMDBNetwork {
	id: number;
	name: string;
	logo_path: string | null;
	origin_country: string;
}

/** TMDB content rating */
export interface TMDBContentRating {
	iso_3166_1: string;
	rating: string;
}

/** Full TMDB movie detail (with appended data) */
export interface TMDBMovieDetail {
	id: number;
	title: string;
	original_title: string;
	overview: string;
	tagline: string;
	poster_path: string | null;
	backdrop_path: string | null;
	release_date: string;
	runtime: number;
	vote_average: number;
	vote_count: number;
	genres: TMDBGenre[];
	status: string;
	budget: number;
	revenue: number;
	imdb_id: string | null;
	original_language: string;
	production_companies: TMDBProductionCompany[];
	spoken_languages: { english_name: string; iso_639_1: string; name: string }[];
	// Appended data
	credits?: {
		cast: TMDBCastMember[];
		crew: TMDBCrewMember[];
	};
	external_ids?: {
		imdb_id: string | null;
		facebook_id: string | null;
		instagram_id: string | null;
		twitter_id: string | null;
	};
	'watch/providers'?: {
		results: Record<string, TMDBWatchProviderRegion>;
	};
}

/** Full TMDB TV series detail (with appended data) */
export interface TMDBTvDetail {
	id: number;
	name: string;
	original_name: string;
	overview: string;
	tagline: string;
	poster_path: string | null;
	backdrop_path: string | null;
	first_air_date: string;
	last_air_date: string;
	number_of_seasons: number;
	number_of_episodes: number;
	episode_run_time: number[];
	vote_average: number;
	vote_count: number;
	genres: TMDBGenre[];
	status: string;
	type: string;
	networks: TMDBNetwork[];
	created_by: { id: number; name: string; profile_path: string | null }[];
	seasons: TMDBSeasonSummary[];
	original_language: string;
	production_companies: TMDBProductionCompany[];
	spoken_languages: { english_name: string; iso_639_1: string; name: string }[];
	next_episode_to_air: TMDBEpisode | null;
	last_episode_to_air: TMDBEpisode | null;
	// Appended data
	credits?: {
		cast: TMDBCastMember[];
		crew: TMDBCrewMember[];
	};
	external_ids?: {
		imdb_id: string | null;
		tvdb_id: number | null;
		facebook_id: string | null;
		instagram_id: string | null;
		twitter_id: string | null;
	};
	'watch/providers'?: {
		results: Record<string, TMDBWatchProviderRegion>;
	};
	content_ratings?: {
		results: TMDBContentRating[];
	};
}

/** Display name for a TMDB search result */
export function tmdbDisplayTitle(item: TMDBSearchResult): string {
	return item.title || item.name || item.original_title || item.original_name || 'Unknown';
}

/** Release year from a TMDB search result */
export function tmdbYear(item: TMDBSearchResult): string | null {
	const date = item.release_date || item.first_air_date;
	if (!date) return null;
	return date.split('-')[0] || null;
}

// ─── Jellyfin types ───────────────────────────────────────────────────────────

/** A single item from the Jellyfin media library */
export interface JellyfinItem {
	/** Jellyfin item ID */
	id: string;
	/** Display name */
	name: string;
	/** Production year */
	year?: number;
	/** Jellyfin item type */
	type: 'Movie' | 'Series';
	/** TMDB numeric ID (string from Jellyfin ProviderIds) */
	tmdbId?: string;
	/** IMDB ID e.g. "tt0944947" */
	imdbId?: string;
	/** Proxied poster URL via /api/library/image/{id} */
	imageUrl: string;
	/** Whether Jellyfin has a Primary image for this item */
	hasPoster: boolean;
}
