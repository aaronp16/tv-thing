import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getSeasonDetails } from '$lib/server/tmdb-client';

export const GET: RequestHandler = async ({ params }) => {
	const seriesId = parseInt(params.id, 10);
	const seasonNumber = parseInt(params.num, 10);

	if (isNaN(seriesId) || isNaN(seasonNumber)) {
		return json({ error: 'Invalid series ID or season number' }, { status: 400 });
	}

	try {
		const data = await getSeasonDetails(seriesId, seasonNumber);
		return json(data);
	} catch (err) {
		console.error(`[api/tmdb/tv/${seriesId}/season/${seasonNumber}] Error:`, err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to fetch season details' },
			{ status: 500 }
		);
	}
};
