/**
 * GET /api/search?q=breaking+bad&category=tv-episodes&sort=seeders&order=desc
 *
 * Search TorrentLeech for TV shows, movies, etc.
 *
 * Query params:
 *   q        - Search query (required)
 *   category - 'tv-episodes' | 'tv-boxsets' | 'movies' | 'documentaries' (default: 'tv-episodes')
 *   sort     - 'added' | 'seeders' | 'size' | 'nameSort' (default: 'seeders')
 *   order    - 'desc' | 'asc' (default: 'desc')
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { search } from '$lib/server/tl-client.js';
import { CATEGORY_MAP, type SearchCategory, type SortBy, type SortOrder } from '$lib/types.js';

const VALID_CATEGORIES: SearchCategory[] = ['tv-episodes', 'tv-boxsets', 'movies', 'documentaries'];
const VALID_SORTS: SortBy[] = ['added', 'seeders', 'size', 'nameSort'];
const VALID_ORDERS: SortOrder[] = ['desc', 'asc'];

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q');
	const category = (url.searchParams.get('category') || 'tv-episodes') as SearchCategory;
	const sort = (url.searchParams.get('sort') || 'seeders') as SortBy;
	const order = (url.searchParams.get('order') || 'desc') as SortOrder;

	if (!query) {
		return json({ error: 'Missing query parameter "q"' }, { status: 400 });
	}

	if (!VALID_CATEGORIES.includes(category)) {
		return json(
			{ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` },
			{ status: 400 }
		);
	}

	if (!VALID_SORTS.includes(sort)) {
		return json(
			{ error: `Invalid sort. Must be one of: ${VALID_SORTS.join(', ')}` },
			{ status: 400 }
		);
	}

	if (!VALID_ORDERS.includes(order)) {
		return json({ error: 'Invalid order. Must be "desc" or "asc"' }, { status: 400 });
	}

	try {
		const categoryIds = CATEGORY_MAP[category];
		const result = await search(query, categoryIds, sort, order);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error('[api/search] Error:', message);
		return json({ error: message }, { status: 500 });
	}
};
