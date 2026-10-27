/**
 * Watch list API
 *
 * GET    /api/watchlist                         → { items, arrived }
 * POST   /api/watchlist { tmdbId, mediaType, title, year?, posterPath? } → { items }
 * DELETE /api/watchlist?tmdbId=123&mediaType=tv → { items }
 *
 * GET drops items that are now in Jellyfin and returns them as `arrived`.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	AlreadyInLibraryError,
	addToWatchlist,
	getWatchlist,
	removeFromWatchlist
} from '$lib/server/watchlist';

const isMediaType = (v: unknown): v is 'movie' | 'tv' => v === 'movie' || v === 'tv';

function errorResponse(err: unknown, status = 500) {
	console.error('[api/watchlist] Error:', err);
	return json({ error: err instanceof Error ? err.message : 'Watch list error' }, { status });
}

export const GET: RequestHandler = async () => {
	try {
		return json(await getWatchlist());
	} catch (err) {
		return errorResponse(err);
	}
};

export const POST: RequestHandler = async ({ request }) => {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { tmdbId, mediaType, title, year, posterPath } = body;
	if (typeof tmdbId !== 'number' || !isMediaType(mediaType) || typeof title !== 'string') {
		return json({ error: 'tmdbId, mediaType and title are required' }, { status: 400 });
	}

	try {
		const items = await addToWatchlist({
			tmdbId,
			mediaType,
			title,
			year: typeof year === 'string' && year ? year : undefined,
			posterPath: typeof posterPath === 'string' ? posterPath : null
		});
		return json({ items });
	} catch (err) {
		if (err instanceof AlreadyInLibraryError) return json({ error: err.message }, { status: 409 });
		return errorResponse(err);
	}
};

export const DELETE: RequestHandler = async ({ url }) => {
	const tmdbId = Number(url.searchParams.get('tmdbId'));
	const mediaType = url.searchParams.get('mediaType');
	if (!tmdbId || !isMediaType(mediaType)) {
		return json({ error: 'tmdbId and mediaType are required' }, { status: 400 });
	}

	try {
		return json({ items: await removeFromWatchlist({ tmdbId, mediaType }) });
	} catch (err) {
		return errorResponse(err);
	}
};
