import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	isMovieDownloaded,
	isTvShowDownloaded,
	isTvSeasonDownloaded
} from '$lib/server/library-scanner';
import { isInJellyfinLibrary, isJellyfinConfigured } from '$lib/server/jellyfin-client';

export const GET: RequestHandler = async ({ url }) => {
	const title = url.searchParams.get('title');
	const mediaType = url.searchParams.get('mediaType') as 'movie' | 'tv' | null;
	const year = url.searchParams.get('year');
	const seasonParam = url.searchParams.get('season');
	const tmdbId = url.searchParams.get('tmdbId');

	if (!title || !mediaType) {
		return json({ error: 'Parameters "title" and "mediaType" are required' }, { status: 400 });
	}

	try {
		let downloaded = false;

		if (isJellyfinConfigured()) {
			// Use Jellyfin as the source of truth — TMDB ID match is exact, name match is fuzzy
			downloaded = await isInJellyfinLibrary({
				tmdbId: tmdbId ?? undefined,
				title,
				mediaType,
				seasonNumber: seasonParam !== null ? parseInt(seasonParam, 10) : undefined
			});
		} else {
			// Fallback: filesystem scan
			if (mediaType === 'movie') {
				downloaded = await isMovieDownloaded(title, year ? parseInt(year, 10) : undefined);
			} else if (seasonParam !== null) {
				downloaded = await isTvSeasonDownloaded(title, parseInt(seasonParam, 10));
			} else {
				downloaded = await isTvShowDownloaded(title);
			}
		}

		return json({ downloaded });
	} catch (err) {
		console.error('[api/library/check] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Library check failed' },
			{ status: 500 }
		);
	}
};
