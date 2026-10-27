/**
 * Storage report
 *
 * Builds the two storage treemaps (library and torrents) and links each
 * tv/movies torrent to its copies in the library.
 *
 * Linking: copyToLibrary() keeps the original filename and copies the bytes
 * unchanged, so a library file with the same filename and exact size as a
 * torrent file is that file's copy. Nothing is stored — links are worked out
 * from disk on every scan, so renamed folders don't break them.
 */

import { lstat, readdir, rm, rmdir, statfs } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { env } from './env.js';
import { deleteTorrent, getTorrentFiles, getTorrents } from './qbittorrent-client.js';
import type { QBTorrent, QBTorrentFile } from './qbittorrent-client.js';
import { getRequiredSeedHours, getSnatchlist } from './tl-client.js';
import type { TLSnatch } from './tl-client.js';
import { refreshLibrary } from './jellyfin-client.js';
import { parseReleaseName } from './media-library.js';
import type {
	LinkedFile,
	StorageNode,
	StorageReport,
	StorageTorrent,
	TLSeedStatus
} from '$lib/types.js';

const VIDEO_EXTENSIONS = new Set([
	'.mkv',
	'.mp4',
	'.avi',
	'.mov',
	'.wmv',
	'.flv',
	'.m4v',
	'.ts',
	'.webm'
]);
const SUBTITLE_EXTENSIONS = new Set(['.srt', '.sub', '.idx', '.ass', '.ssa']);
const MEDIA_CATEGORIES = new Set(['tv', 'movies']);

const REPORT_TTL = 60_000;
let reportCache: StorageReport | null = null;

/** Torrent file lists never change, so cache them for the life of the process */
const torrentFilesCache = new Map<string, QBTorrentFile[]>();

// ─── Display names ────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Short label for a release or folder name, e.g.
 * "Cars.2006.1080p.BluRay.x264-nikt0" → "Cars (2006)", detail "1080p"
 */
function displayName(name: string): { label?: string; detail?: string } {
	const info = parseReleaseName(name);
	// Drop bracketed tags and anything after them: "(2160p ATVP …)", "[TAoE]"
	const title = info.title
		.replace(/\s*[[(].*$/, '')
		.replace(/[\s-]+$/, '')
		.trim();
	const year = info.year ?? Number(name.match(/\(((?:19|20)\d{2})\)/)?.[1] ?? 0);

	let label = title || name;
	if (info.season !== undefined && info.episode !== undefined) {
		label = `${title} S${pad(info.season)}E${pad(info.episode)}`;
	} else if (info.season !== undefined) {
		label = `${title} S${pad(info.season)}`;
	} else if (year) {
		label = `${title} (${year})`;
	}

	return { label: label !== name ? label : undefined, detail: info.resolution };
}

// ─── Disk walking ─────────────────────────────────────────────────────────────

interface WalkedFile {
	/** Absolute path */
	path: string;
	size: number;
}

/** Total size of a file or directory tree. Symlinks are not followed. */
async function walk(path: string, files?: WalkedFile[], exclude?: Set<string>): Promise<number> {
	if (exclude?.has(path)) return 0;

	let info;
	try {
		info = await lstat(path);
	} catch {
		return 0;
	}

	if (info.isFile()) {
		files?.push({ path, size: info.size });
		return info.size;
	}
	if (!info.isDirectory()) return 0;

	let entries: string[];
	try {
		entries = await readdir(path);
	} catch {
		return 0;
	}

	let total = 0;
	for (const entry of entries) {
		total += await walk(join(path, entry), files, exclude);
	}
	return total;
}

async function listDir(path: string): Promise<{ name: string; isDir: boolean }[]> {
	try {
		const entries = await readdir(path, { withFileTypes: true });
		return entries
			.filter((e) => e.isDirectory() || e.isFile())
			.map((e) => ({ name: e.name, isDir: e.isDirectory() }));
	} catch {
		return [];
	}
}

function bySizeDesc(a: StorageNode, b: StorageNode) {
	return b.size - a.size;
}

// ─── Library tree ─────────────────────────────────────────────────────────────

/** TV: show → season. Loose files directly in a show folder become one "Other files" leaf. */
async function buildTvGroup(files: WalkedFile[]): Promise<StorageNode> {
	const tvDir = join(env.MEDIA_DIR, 'tv');
	const shows: StorageNode[] = [];

	for (const show of await listDir(tvDir)) {
		const showPath = join(tvDir, show.name);
		const rel = relative(env.MEDIA_DIR, showPath);

		if (!show.isDir) {
			const size = await walk(showPath, files);
			if (size > 0)
				shows.push({ id: `lib:${rel}`, name: show.name, size, kind: 'show', path: rel });
			continue;
		}

		const seasons: StorageNode[] = [];
		let looseSize = 0;
		for (const entry of await listDir(showPath)) {
			const entryPath = join(showPath, entry.name);
			const size = await walk(entryPath, files);
			if (size === 0) continue;
			if (entry.isDir) {
				const seasonRel = relative(env.MEDIA_DIR, entryPath);
				seasons.push({
					id: `lib:${seasonRel}`,
					name: entry.name,
					size,
					kind: 'season',
					path: seasonRel
				});
			} else {
				looseSize += size;
			}
		}
		if (looseSize > 0) {
			seasons.push({ id: `lib:${rel}/*`, name: 'Other files', size: looseSize, kind: 'other' });
		}

		const size = seasons.reduce((sum, s) => sum + s.size, 0);
		if (size > 0) {
			shows.push({
				id: `lib:${rel}`,
				name: show.name,
				size,
				kind: 'show',
				path: rel,
				...displayName(show.name),
				children: seasons.sort(bySizeDesc)
			});
		}
	}

	shows.sort(bySizeDesc);
	return {
		id: 'lib-group:tv',
		name: 'TV Shows',
		size: shows.reduce((sum, s) => sum + s.size, 0),
		kind: 'group',
		children: shows
	};
}

async function buildMoviesGroup(files: WalkedFile[]): Promise<StorageNode> {
	const moviesDir = join(env.MEDIA_DIR, 'movies');
	const movies: StorageNode[] = [];

	for (const movie of await listDir(moviesDir)) {
		const moviePath = join(moviesDir, movie.name);
		const rel = relative(env.MEDIA_DIR, moviePath);
		const size = await walk(moviePath, files);
		if (size > 0)
			movies.push({
				id: `lib:${rel}`,
				name: movie.name,
				size,
				kind: 'movie',
				path: rel,
				...displayName(movie.name)
			});
	}

	movies.sort(bySizeDesc);
	return {
		id: 'lib-group:movies',
		name: 'Movies',
		size: movies.reduce((sum, m) => sum + m.size, 0),
		kind: 'group',
		children: movies
	};
}

/** Everything else in MEDIA_DIR (books, music, …), one leaf per top-level entry */
async function buildLibraryOtherGroup(): Promise<StorageNode> {
	const others: StorageNode[] = [];
	for (const entry of await listDir(env.MEDIA_DIR)) {
		if (entry.isDir && MEDIA_CATEGORIES.has(entry.name)) continue;
		const size = await walk(join(env.MEDIA_DIR, entry.name));
		if (size > 0)
			others.push({ id: `lib-other:${entry.name}`, name: entry.name, size, kind: 'other' });
	}
	others.sort(bySizeDesc);
	return {
		id: 'lib-group:other',
		name: 'Other',
		size: others.reduce((sum, o) => sum + o.size, 0),
		kind: 'group',
		children: others
	};
}

// ─── Torrents ─────────────────────────────────────────────────────────────────

/** Map qBittorrent's container path to where this app sees the same file */
function toLocalTorrentPath(qbPath: string): string {
	return qbPath.replace('/data/torrents', env.TORRENT_DOWNLOAD_DIR);
}

function fileKey(name: string, size: number): string {
	return `${name}\0${size}`;
}

/** Find library copies of a torrent's video files, plus subtitles next to them */
function linkTorrentFiles(
	torrentFiles: QBTorrentFile[],
	libraryIndex: Map<string, WalkedFile[]>
): { libraryFiles: LinkedFile[]; videoFiles: number; linkedVideoFiles: number } {
	const linked = new Map<string, LinkedFile>();
	const linkedDirs = new Set<string>();
	let videoFiles = 0;
	let linkedVideoFiles = 0;

	for (const file of torrentFiles) {
		const name = basename(file.name);
		if (!VIDEO_EXTENSIONS.has(extname(name).toLowerCase())) continue;
		videoFiles++;
		const matches = libraryIndex.get(fileKey(name, file.size)) ?? [];
		if (matches.length > 0) linkedVideoFiles++;
		for (const match of matches) {
			linked.set(match.path, { path: relative(env.MEDIA_DIR, match.path), size: match.size });
			linkedDirs.add(dirname(match.path));
		}
	}

	// Subtitle names like "English.srt" are common, so only link ones that sit
	// beside a linked video
	for (const file of torrentFiles) {
		const name = basename(file.name);
		if (!SUBTITLE_EXTENSIONS.has(extname(name).toLowerCase())) continue;
		for (const match of libraryIndex.get(fileKey(name, file.size)) ?? []) {
			if (linkedDirs.has(dirname(match.path))) {
				linked.set(match.path, { path: relative(env.MEDIA_DIR, match.path), size: match.size });
			}
		}
	}

	return { libraryFiles: [...linked.values()], videoFiles, linkedVideoFiles };
}

function normaliseName(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Match a torrent to its snatchlist row by exact size, using the name to break ties */
function findSnatch(torrent: QBTorrent, snatches: TLSnatch[]): TLSnatch | null {
	const bySize = snatches.filter((s) => s.size === torrent.total_size);
	if (bySize.length <= 1) return bySize[0] ?? null;
	const name = normaliseName(torrent.name);
	return bySize.find((s) => normaliseName(s.name) === name) ?? null;
}

function toSeedStatus(snatch: TLSnatch, requiredHours: number): TLSeedStatus {
	return {
		tlId: snatch.tlId,
		seedSeconds: snatch.seedSeconds,
		ratio: snatch.ratio,
		onHnrList: snatch.onHnrList,
		requiredHours,
		safe: snatch.seedSeconds >= requiredHours * 3600 || snatch.ratio >= 1
	};
}

async function getFilesFor(hash: string): Promise<QBTorrentFile[]> {
	const cached = torrentFilesCache.get(hash);
	if (cached) return cached;
	const files = await getTorrentFiles(hash);
	torrentFilesCache.set(hash, files);
	return files;
}

async function buildTorrents(libraryIndex: Map<string, WalkedFile[]>): Promise<{
	tree: StorageNode;
	details: StorageTorrent[];
	tlError?: string;
}> {
	const all = await getTorrents();
	const mediaTorrents = all.filter((t) => MEDIA_CATEGORIES.has(t.category));

	let snatches: TLSnatch[] = [];
	let requiredHours = 168;
	let tlError: string | undefined;
	try {
		[snatches, requiredHours] = await Promise.all([getSnatchlist(), getRequiredSeedHours()]);
	} catch (err) {
		tlError = err instanceof Error ? err.message : 'Failed to load TorrentLeech snatchlist';
		console.error('[storage] TL snatchlist failed:', err);
	}

	const details: StorageTorrent[] = [];
	for (const torrent of mediaTorrents) {
		const files = await getFilesFor(torrent.hash);
		const snatch = findSnatch(torrent, snatches);
		details.push({
			hash: torrent.hash,
			name: torrent.name,
			category: torrent.category,
			size: torrent.size,
			progress: torrent.progress,
			tl: snatch ? toSeedStatus(snatch, requiredHours) : null,
			...linkTorrentFiles(files, libraryIndex)
		});
	}

	const groupFor = (category: string, id: string, name: string): StorageNode => {
		const children = details
			.filter((d) => d.category === category)
			.map((d) => ({
				id: `t:${d.hash}`,
				name: d.name,
				size: d.size,
				kind: 'torrent' as const,
				hash: d.hash,
				...displayName(d.name)
			}))
			.sort(bySizeDesc);
		return { id, name, size: children.reduce((s, c) => s + c.size, 0), kind: 'group', children };
	};

	// Other: everything on disk in the torrents folder that isn't a tv/movies
	// torrent — other categories (books, music) and leftover files
	const claimed = new Set(mediaTorrents.map((t) => toLocalTorrentPath(t.content_path)));
	const others: StorageNode[] = [];
	for (const entry of await listDir(env.TORRENT_DOWNLOAD_DIR)) {
		const size = await walk(join(env.TORRENT_DOWNLOAD_DIR, entry.name), undefined, claimed);
		if (size === 0) continue;
		const name = MEDIA_CATEGORIES.has(entry.name)
			? `${entry.name} (not in qBittorrent)`
			: entry.name;
		others.push({ id: `t-other:${entry.name}`, name, size, kind: 'other' });
	}
	others.sort(bySizeDesc);

	const groups = [
		groupFor('tv', 't-group:tv', 'TV'),
		groupFor('movies', 't-group:movies', 'Movies'),
		{
			id: 't-group:other',
			name: 'Other',
			size: others.reduce((s, o) => s + o.size, 0),
			kind: 'group' as const,
			children: others
		}
	];

	return {
		tree: {
			id: 'torrents',
			name: 'Torrents',
			size: groups.reduce((s, g) => s + g.size, 0),
			kind: 'group',
			children: groups
		},
		details,
		tlError
	};
}

// ─── Report ───────────────────────────────────────────────────────────────────

export async function getStorageReport(force = false): Promise<StorageReport> {
	if (!force && reportCache && Date.now() - reportCache.scannedAt < REPORT_TTL) {
		return reportCache;
	}

	const libraryFiles: WalkedFile[] = [];
	const [tv, movies, other] = [
		await buildTvGroup(libraryFiles),
		await buildMoviesGroup(libraryFiles),
		await buildLibraryOtherGroup()
	];

	const libraryIndex = new Map<string, WalkedFile[]>();
	for (const file of libraryFiles) {
		const key = fileKey(basename(file.path), file.size);
		const list = libraryIndex.get(key);
		if (list) list.push(file);
		else libraryIndex.set(key, [file]);
	}

	const torrents = await buildTorrents(libraryIndex);

	const stats = await statfs(env.MEDIA_DIR);
	const total = stats.blocks * stats.bsize;
	const free = stats.bavail * stats.bsize;

	reportCache = {
		disk: { total, free, used: total - free },
		library: {
			id: 'library',
			name: 'Library',
			size: tv.size + movies.size + other.size,
			kind: 'group',
			children: [tv, movies, other]
		},
		torrents: torrents.tree,
		torrentDetails: torrents.details,
		tlError: torrents.tlError,
		scannedAt: Date.now()
	};
	return reportCache;
}

// ─── Deleting ─────────────────────────────────────────────────────────────────

/**
 * Resolve a library path from the client, allowing only paths strictly inside
 * MEDIA_DIR/tv or MEDIA_DIR/movies
 */
function resolveLibraryPath(relPath: string): { abs: string; root: string } | null {
	const abs = resolve(env.MEDIA_DIR, relPath);
	for (const category of MEDIA_CATEGORIES) {
		const root = resolve(env.MEDIA_DIR, category);
		if (abs.startsWith(root + sep)) return { abs, root };
	}
	return null;
}

/** Remove now-empty parent folders (e.g. an emptied season or show), stopping at root */
async function pruneEmptyParents(path: string, root: string): Promise<void> {
	let dir = dirname(path);
	while (dir.startsWith(root + sep)) {
		try {
			await rmdir(dir); // only succeeds when empty
		} catch {
			return;
		}
		dir = dirname(dir);
	}
}

export interface DeleteResult {
	deletedPaths: string[];
	deletedTorrents: string[];
	errors: string[];
}

/**
 * Delete library paths (files or folders) and tv/movies torrents. Torrents are
 * removed from qBittorrent together with their downloaded files.
 */
export async function deleteStorage(opts: {
	paths: string[];
	torrents: string[];
}): Promise<DeleteResult> {
	const result: DeleteResult = { deletedPaths: [], deletedTorrents: [], errors: [] };

	for (const relPath of opts.paths) {
		const resolved = resolveLibraryPath(relPath);
		if (!resolved) {
			result.errors.push(`Refusing to delete outside the TV/Movies library: ${relPath}`);
			continue;
		}
		try {
			await rm(resolved.abs, { recursive: true });
			await pruneEmptyParents(resolved.abs, resolved.root);
			result.deletedPaths.push(relPath);
			console.log(`[storage] Deleted library path: ${resolved.abs}`);
		} catch (err) {
			result.errors.push(`${relPath}: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	if (opts.torrents.length > 0) {
		const known = await getTorrents({ hashes: opts.torrents });
		for (const hash of opts.torrents) {
			const torrent = known.find((t) => t.hash === hash);
			if (!torrent) {
				result.errors.push(`Torrent not found: ${hash}`);
				continue;
			}
			if (!MEDIA_CATEGORIES.has(torrent.category)) {
				result.errors.push(`Refusing to delete non-TV/movie torrent: ${torrent.name}`);
				continue;
			}
			try {
				await deleteTorrent(hash, true);
				torrentFilesCache.delete(hash);
				result.deletedTorrents.push(hash);
			} catch (err) {
				result.errors.push(`${torrent.name}: ${err instanceof Error ? err.message : String(err)}`);
			}
		}
	}

	reportCache = null;

	if (result.deletedPaths.length > 0) {
		refreshLibrary().catch((err) => console.warn('[storage] Jellyfin refresh failed:', err));
	}

	return result;
}
