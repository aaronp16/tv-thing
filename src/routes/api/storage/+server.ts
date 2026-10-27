import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStorageReport } from '$lib/server/storage';

/** GET /api/storage[?refresh=1] — library + torrent treemaps with TL status and links */
export const GET: RequestHandler = async ({ url }) => {
	try {
		return json(await getStorageReport(url.searchParams.get('refresh') === '1'));
	} catch (err) {
		console.error('[api/storage] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to scan storage' },
			{ status: 500 }
		);
	}
};
