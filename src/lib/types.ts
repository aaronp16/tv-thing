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
	DOCUMENTARIES: 29,
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
		TL_CATEGORIES.TV_CARTOONS,
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
		TL_CATEGORIES.MOVIES_FOREIGN,
	],
	documentaries: [TL_CATEGORIES.DOCUMENTARIES],
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
	documentaries: 'Documentaries',
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
