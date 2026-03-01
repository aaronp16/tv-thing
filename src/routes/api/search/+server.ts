import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { searchBooks } from '$lib/server/mam-client.js';
import type { SearchField } from '$lib/types.js';

/**
 * GET /api/search?q=harry+potter&field=title&page=0
 *
 * Search MyAnonamouse for ebooks.
 *
 * Query params:
 *   q     - Search query (required)
 *   field - 'title' | 'author' (default: 'title')
 *   page  - Page number, 0-based (default: 0)
 */
export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q');
	const field = (url.searchParams.get('field') || 'title') as SearchField;
	const page = parseInt(url.searchParams.get('page') || '0', 10);

	if (!query) {
		return json({ error: 'Missing query parameter "q"' }, { status: 400 });
	}

	if (!['title', 'author'].includes(field)) {
		return json({ error: 'Invalid field. Must be "title" or "author"' }, { status: 400 });
	}

	try {
		const result = await searchBooks(query, field, page);
		return json(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error('[api/search] Error:', message);
		return json({ error: message }, { status: 500 });
	}
};
