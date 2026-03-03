import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLibraryItems } from '$lib/server/jellyfin-client';

export const GET: RequestHandler = async ({ url }) => {
	const type = (url.searchParams.get('type') || 'all') as 'movies' | 'tvshows' | 'all';

	try {
		const items = await getLibraryItems(type);
		return json({ items });
	} catch (err) {
		console.error('[api/library/items] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to fetch library' },
			{ status: 500 }
		);
	}
};
