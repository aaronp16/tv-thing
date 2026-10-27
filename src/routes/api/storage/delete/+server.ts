import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteStorage } from '$lib/server/storage';

/**
 * POST /api/storage/delete
 *
 * Body: { paths?: string[], torrents?: string[] }
 * - paths: library paths relative to MEDIA_DIR (must be inside tv/ or movies/)
 * - torrents: qBittorrent hashes (tv/movies only), removed along with their files
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: { paths?: unknown; torrents?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const isStringArray = (v: unknown): v is string[] =>
		Array.isArray(v) && v.every((x) => typeof x === 'string');
	const paths = body.paths ?? [];
	const torrents = body.torrents ?? [];
	if (!isStringArray(paths) || !isStringArray(torrents)) {
		return json({ error: 'paths and torrents must be string arrays' }, { status: 400 });
	}

	try {
		return json(await deleteStorage({ paths, torrents }));
	} catch (err) {
		console.error('[api/storage/delete] Error:', err);
		return json({ error: err instanceof Error ? err.message : 'Delete failed' }, { status: 500 });
	}
};
