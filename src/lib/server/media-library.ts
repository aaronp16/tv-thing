/**
 * Media library organizer
 *
 * Copies completed downloads into a Plex/Jellyfin-compatible folder structure:
 *   TV:     {MEDIA_DIR}/tv/{Show Name}/Season {XX}/{original file}
 *   Movies: {MEDIA_DIR}/movies/{Movie Name} ({Year})/{original file}
 *
 * Uses scene release naming conventions to parse show names, seasons,
 * episodes, movie titles, and years from filenames.
 */

import { env } from './env.js';
import { stat, mkdir, readdir, copyFile } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import type { MediaType } from '$lib/types.js';

/**
 * Parsed release name info
 */
interface ReleaseInfo {
	/** Clean title (dots/underscores replaced with spaces) */
	title: string;
	/** Season number (TV only) */
	season?: number;
	/** Episode number (TV only) */
	episode?: number;
	/** Year (primarily for movies) */
	year?: number;
	/** Resolution e.g. "720p", "1080p", "2160p" */
	resolution?: string;
}

/**
 * Parse a scene release name into structured info
 *
 * Handles patterns like:
 *   Show.Name.S01E02.720p.HDTV.x264-GROUP
 *   Movie.Name.2024.1080p.BluRay.x264-GROUP
 *   Show Name - S01E02 - Episode Title
 */
export function parseReleaseName(name: string): ReleaseInfo {
	// Remove file extension if present
	const ext = extname(name);
	const clean = ext ? name.slice(0, -ext.length) : name;

	// Try to match TV pattern: S01E02 or S01E02E03 etc
	const tvMatch = clean.match(/^(.+?)[.\s_-]+[Ss](\d{1,2})[Ee](\d{1,3})/);
	if (tvMatch) {
		const title = tvMatch[1].replace(/[._]/g, ' ').trim();
		return {
			title,
			season: parseInt(tvMatch[2], 10),
			episode: parseInt(tvMatch[3], 10),
			resolution: extractResolution(clean)
		};
	}

	// Try "1x02" format
	const altTvMatch = clean.match(/^(.+?)[.\s_-]+(\d{1,2})x(\d{1,3})/i);
	if (altTvMatch) {
		const title = altTvMatch[1].replace(/[._]/g, ' ').trim();
		return {
			title,
			season: parseInt(altTvMatch[2], 10),
			episode: parseInt(altTvMatch[3], 10),
			resolution: extractResolution(clean)
		};
	}

	// Try "Season X" pattern for boxsets
	const seasonMatch = clean.match(/^(.+?)[.\s_-]+Season[.\s_-]+(\d{1,2})/i);
	if (seasonMatch) {
		const title = seasonMatch[1].replace(/[._]/g, ' ').trim();
		return {
			title,
			season: parseInt(seasonMatch[2], 10),
			resolution: extractResolution(clean)
		};
	}

	// Movie pattern: title followed by year
	const movieMatch = clean.match(/^(.+?)[.\s_-]+(?:19|20)(\d{2})(?:[.\s_-]|$)/);
	if (movieMatch) {
		const title = movieMatch[1].replace(/[._]/g, ' ').trim();
		const yearStr = movieMatch[2];
		const century = parseInt(yearStr, 10) >= 30 ? 1900 : 2000;
		return {
			title,
			year: century + parseInt(yearStr, 10),
			resolution: extractResolution(clean)
		};
	}

	// Fallback: just clean the name
	return {
		title: clean.replace(/[._]/g, ' ').trim(),
		resolution: extractResolution(clean)
	};
}

/**
 * Extract resolution from a release name
 */
function extractResolution(name: string): string | undefined {
	const match = name.match(/(?:^|[.\s_-])(2160p|1080p|720p|480p|4[Kk])(?:[.\s_-]|$)/);
	return match ? match[1] : undefined;
}

/**
 * Capitalize the first letter of each word
 */
function titleCase(str: string): string {
	return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Get the Jellyfin-compatible destination path for a media file
 *
 * @param filename - Original filename from the torrent
 * @param mediaType - 'tv' or 'movie'
 * @returns Full destination path
 */
export function getDestinationPath(filename: string, mediaType: MediaType): string {
	const info = parseReleaseName(filename);

	if (mediaType === 'tv') {
		const showName = titleCase(info.title);
		const seasonNum = info.season ?? 1;
		const seasonDir = `Season ${String(seasonNum).padStart(2, '0')}`;
		return join(env.MEDIA_DIR, 'tv', showName, seasonDir, filename);
	} else {
		const movieTitle = titleCase(info.title);
		const yearSuffix = info.year ? ` (${info.year})` : '';
		const folderName = `${movieTitle}${yearSuffix}`;
		return join(env.MEDIA_DIR, 'movies', folderName, filename);
	}
}

/**
 * Copy a completed download to the Jellyfin media library
 *
 * Handles both single files and directories (multi-file torrents).
 *
 * @param sourcePath - Path to the completed download (file or directory)
 * @param mediaType - 'tv' or 'movie'
 * @returns Array of destination paths that were created
 */
export async function copyToLibrary(sourcePath: string, mediaType: MediaType): Promise<string[]> {
	console.log(
		`[media-library] copyToLibrary called: sourcePath=${sourcePath} mediaType=${mediaType}`
	);
	const sourceInfo = await stat(sourcePath);
	const copiedPaths: string[] = [];

	// Common video extensions to copy
	const videoExtensions = new Set([
		'.mkv',
		'.mp4',
		'.avi',
		'.mov',
		'.wmv',
		'.flv',
		'.m4v',
		'.ts',
		'.webm',
		'.srt',
		'.sub',
		'.idx',
		'.ass',
		'.ssa' // subtitle files too
	]);

	if (sourceInfo.isDirectory()) {
		// Multi-file torrent: copy all video files
		const files = await readdir(sourcePath, { recursive: true });
		console.log(`[media-library] Directory with ${files.length} files:`, files);
		for (const file of files) {
			const ext = extname(String(file)).toLowerCase();
			if (!videoExtensions.has(ext)) {
				console.log(`[media-library] Skipping (not a video/sub): ${file}`);
				continue;
			}

			const srcFile = join(sourcePath, String(file));
			const destFile = getDestinationPath(String(file), mediaType);
			const destDir = join(destFile, '..');

			await mkdir(destDir, { recursive: true });
			await copyFile(srcFile, destFile);
			copiedPaths.push(destFile);
			console.log(`[media-library] Copied: ${srcFile} -> ${destFile}`);
		}
	} else {
		// Single file torrent
		const filename = basename(sourcePath);
		const ext = extname(filename).toLowerCase();
		console.log(`[media-library] Single file: ${filename} ext=${ext}`);

		if (videoExtensions.has(ext)) {
			const destFile = getDestinationPath(filename, mediaType);
			const destDir = join(destFile, '..');

			await mkdir(destDir, { recursive: true });
			await copyFile(sourcePath, destFile);
			copiedPaths.push(destFile);
			console.log(`[media-library] Copied: ${sourcePath} -> ${destFile}`);
		}
	}

	if (copiedPaths.length === 0) {
		console.warn(`[media-library] No video files found in: ${sourcePath}`);
	}

	return copiedPaths;
}
