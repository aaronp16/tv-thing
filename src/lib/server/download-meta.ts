/**
 * Download metadata
 *
 * Remembers which TMDB title each torrent was downloaded for (keyed by
 * torrent hash) in $DATA_DIR/downloads.json, so in-progress downloads can be
 * shown with their poster even after a restart.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from './env.js';
import type { DownloadMeta } from '$lib/types.js';

type MetaFile = Record<string, DownloadMeta & { addedAt: number }>;

const file = () => join(env.DATA_DIR, 'downloads.json');

let queue: Promise<unknown> = Promise.resolve();

/** Serialise read-modify-write cycles */
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
	const run = queue.then(fn, fn);
	queue = run.catch(() => {});
	return run;
}

async function load(): Promise<MetaFile> {
	try {
		return JSON.parse(await readFile(file(), 'utf8'));
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
		throw err;
	}
}

async function save(data: MetaFile): Promise<void> {
	await mkdir(env.DATA_DIR, { recursive: true });
	const tmp = `${file()}.tmp`;
	await writeFile(tmp, JSON.stringify(data, null, '\t'));
	await rename(tmp, file());
}

export function saveDownloadMeta(hash: string, meta: DownloadMeta): Promise<void> {
	return exclusive(async () => {
		const data = await load();
		data[hash] = { ...meta, addedAt: Date.now() };
		await save(data);
	});
}

/** All stored metadata, dropping entries for torrents that no longer exist */
export function getDownloadMeta(
	existingHashes: Set<string>
): Promise<Record<string, DownloadMeta>> {
	return exclusive(async () => {
		const data = await load();
		const stale = Object.keys(data).filter((h) => !existingHashes.has(h));
		if (stale.length > 0) {
			for (const h of stale) delete data[h];
			await save(data);
		}
		return data;
	});
}
