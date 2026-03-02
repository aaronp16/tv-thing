/**
 * Shared types for book-thing
 */

/** Search result entry from MyAnonamouse */
export interface MamEntry {
	id: number;
	title: string;
	author_info: string;
	narrator_info: string;
	series_info: string;
	category: number;
	catname: string;
	categories: string;
	size: string;
	numfiles: number;
	filetype: string;
	seeders: number;
	leechers: number;
	times_completed: number;
	added: string;
	free: number;
	vip: number;
	lang_code: string;
	language: number;
	tags: number | string;
	browseflags: number;
	comments: number;
}

/** Parsed author/narrator/series info */
export interface PersonInfo {
	id: number;
	name: string;
}

/** Parsed book entry for the frontend */
export interface BookResult {
	id: number;
	title: string;
	authors: PersonInfo[];
	narrators: PersonInfo[];
	series: { id: number; name: string; number?: string }[];
	category: string;
	isAudiobook: boolean;
	isEbook: boolean;
	size: number;
	sizeFormatted: string;
	numFiles: number;
	fileType: string;
	seeders: number;
	leechers: number;
	snatched: number;
	freeleech: boolean;
	vip: boolean;
	language: string;
	added: string;
}

/** Search field filter */
export type SearchField = 'title' | 'author';

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
	/** The MAM torrent ID this was downloaded from */
	mamId?: number;
}

/** Download job for SSE progress */
export interface DownloadJob {
	id: string;
	mamId: number;
	title: string;
	infoHash?: string;
	status: 'fetching' | 'downloading' | 'complete' | 'error';
	progress: number;
	downloadSpeed: number;
	uploadSpeed: number;
	numPeers: number;
	error?: string;
}

// ---------------------------------------------------------------------------
// Anna's Archive types
// ---------------------------------------------------------------------------

/** A search result from Anna's Archive */
export interface AnnaSearchResult {
	/** MD5 hash — unique identifier for this file on Anna's Archive */
	md5: string;
	title: string;
	authors: string;
	coverUrl?: string;
	extension: string;
	sizeBytes: number;
	year?: number;
	language?: string;
	/** Publisher name e.g. "Tor Books" */
	publisher?: string;
	/** Content type from AA e.g. "Book (fiction)", "Book (unknown)", "Magazine" */
	contentType?: string;
}

/** Detailed book info fetched from an Anna's Archive MD5 page */
export interface AnnaBookDetail {
	md5: string;
	title: string;
	authors: string[];
	coverUrl?: string;
	description?: string;
	extension: string;
	publisher?: string;
	year?: number;
	language?: string;
	isbn: string[];
	downloadLinks: {
		type: 'ipfs' | 'libgen_rs' | 'libgen_li' | 'zlib' | 'other';
		url: string;
		label: string;
	}[];
}

/** An in-progress HTTP download from Anna's Archive */
export interface HttpDownloadJob {
	id: string;
	source: 'anna';
	md5: string;
	title: string;
	authors: string;
	extension: string;
	status: 'downloading' | 'complete' | 'error';
	/** 0.0–1.0, or -1 if Content-Length is unknown */
	progress: number;
	bytesDownloaded: number;
	/** -1 if Content-Length header was absent */
	totalBytes: number;
	downloadSpeed: number;
	error?: string;
}

/** A file in the library */
export interface LibraryFile {
	name: string;
	path: string;
	relativePath: string;
	extension: string;
	size: number;
	modifiedAt: string;
}
