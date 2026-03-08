import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDiscover, type DiscoverOptions } from '$lib/server/tmdb-client';

export const GET: RequestHandler = async ({ url }) => {
	const mediaType = (url.searchParams.get('type') || 'movie') as 'movie' | 'tv';
	const sortBy = (url.searchParams.get('sort_by') ||
		'popularity.desc') as DiscoverOptions['sortBy'];
	const genre = url.searchParams.get('genre') ? Number(url.searchParams.get('genre')) : undefined;
	const year = url.searchParams.get('year') ? Number(url.searchParams.get('year')) : undefined;
	const yearMode = (url.searchParams.get('year_mode') || 'in') as 'in' | 'since';
	const month = url.searchParams.get('month') ? Number(url.searchParams.get('month')) : undefined;
	const page = parseInt(url.searchParams.get('page') || '1', 10);

	try {
		const data = await getDiscover({ mediaType, sortBy, genre, year, yearMode, month, page });
		return json(data);
	} catch (err) {
		console.error('[api/tmdb/discover] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to fetch discover results' },
			{ status: 500 }
		);
	}
};
