/**
 * GET /api/anna/search?q={query}&ext={ext}&lang={lang}
 *
 * Search Anna's Archive and return normalized results.
 *
 * Response:
 * {
 *   results: AnnaSearchResult[];
 * }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchAnna } from '$lib/server/anna-client';

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q')?.trim();
	const ext = url.searchParams.get('ext') ?? undefined;
	const lang = url.searchParams.get('lang') ?? undefined;

	if (!query) {
		return json({ error: 'q parameter is required' }, { status: 400 });
	}

	try {
		const results = await searchAnna(query, { ext, lang });
		return json({ results });
	} catch (err) {
		console.error('[api/anna/search] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : "Anna's Archive search failed" },
			{ status: 502 }
		);
	}
};
