import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTrending } from '$lib/server/tmdb-client';

export const GET: RequestHandler = async ({ url }) => {
	const mediaType = (url.searchParams.get('type') || 'all') as 'all' | 'movie' | 'tv';
	const timeWindow = (url.searchParams.get('window') || 'week') as 'day' | 'week';
	const page = parseInt(url.searchParams.get('page') || '1', 10);

	try {
		const data = await getTrending(mediaType, timeWindow, page);
		return json(data);
	} catch (err) {
		console.error('[api/tmdb/trending] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to fetch trending' },
			{ status: 500 }
		);
	}
};
