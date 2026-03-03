import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getMovieDetails } from '$lib/server/tmdb-client';

export const GET: RequestHandler = async ({ params }) => {
	const movieId = parseInt(params.id, 10);

	if (isNaN(movieId)) {
		return json({ error: 'Invalid movie ID' }, { status: 400 });
	}

	try {
		const data = await getMovieDetails(movieId);
		return json(data);
	} catch (err) {
		console.error(`[api/tmdb/movie/${movieId}] Error:`, err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to fetch movie details' },
			{ status: 500 }
		);
	}
};
