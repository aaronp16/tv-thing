/**
 * Client-side helpers for the storage page
 */

import type { StorageTorrent } from '$lib/types';

export interface DeleteResult {
	deletedPaths: string[];
	deletedTorrents: string[];
	errors: string[];
}

/** Delete library paths and/or torrents (with their downloaded files) */
export async function deleteStorage(opts: {
	paths?: string[];
	torrents?: string[];
}): Promise<DeleteResult> {
	const res = await fetch('/api/storage/delete', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(opts)
	});
	const data = await res.json();
	if (!res.ok) throw new Error(data.error || 'Delete failed');
	return data;
}

/** Whether a library path (relative to MEDIA_DIR) is `dir` or inside it */
export function isUnder(path: string, dir: string): boolean {
	return path === dir || path.startsWith(dir + '/');
}

/** Torrents with at least one library copy under `dir` */
export function torrentsLinkedTo(dir: string, torrents: StorageTorrent[]): StorageTorrent[] {
	return torrents.filter((t) => t.libraryFiles.some((f) => isUnder(f.path, dir)));
}

/** Finished, TL-safe, and every video file confirmed in the library */
export function isCleanupCandidate(t: StorageTorrent): boolean {
	return t.progress >= 1 && !!t.tl?.safe && t.videoFiles > 0 && t.linkedVideoFiles === t.videoFiles;
}
