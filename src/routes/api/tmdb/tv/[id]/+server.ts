import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTvDetails } from '$lib/server/tmdb-client';

export const GET: RequestHandler = async ({ params }) => {
	const seriesId = parseInt(params.id, 10);

	if (isNaN(seriesId)) {
		return json({ error: 'Invalid series ID' }, { status: 400 });
	}

	try {
		const data = await getTvDetails(seriesId);
		return json(data);
	} catch (err) {
		console.error(`[api/tmdb/tv/${seriesId}] Error:`, err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to fetch TV details' },
			{ status: 500 }
		);
	}
};
