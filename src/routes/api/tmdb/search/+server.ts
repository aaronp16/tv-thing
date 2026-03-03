import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchMulti } from '$lib/server/tmdb-client';

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q');
	const page = parseInt(url.searchParams.get('page') || '1', 10);

	if (!query?.trim()) {
		return json({ error: 'Query parameter "q" is required' }, { status: 400 });
	}

	try {
		const data = await searchMulti(query.trim(), page);
		return json(data);
	} catch (err) {
		console.error('[api/tmdb/search] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'TMDB search failed' },
			{ status: 500 }
		);
	}
};
