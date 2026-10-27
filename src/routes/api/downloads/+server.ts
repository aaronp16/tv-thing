/**
 * GET /api/downloads
 *
 * TV/movie downloads in progress, with the TMDB title and poster they were
 * started for. Combines in-memory jobs (still fetching the .torrent, or
 * copying into the library) with unfinished torrents in qBittorrent, so
 * downloads still show after a restart.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getActiveJobs } from '$lib/server/downloader';
import { getTorrents, mapState } from '$lib/server/qbittorrent-client';
import { getDownloadMeta } from '$lib/server/download-meta';
import type { ActiveDownload } from '$lib/types';

const MEDIA_CATEGORIES = new Set(['tv', 'movies']);

export const GET: RequestHandler = async () => {
	try {
		const torrents = (await getTorrents()).filter((t) => MEDIA_CATEGORIES.has(t.category));
		const meta = await getDownloadMeta(new Set(torrents.map((t) => t.hash)));
		const jobs = getActiveJobs();
		const jobByHash = new Map(jobs.filter((j) => j.infoHash).map((j) => [j.infoHash!, j]));

		const downloads: ActiveDownload[] = [];

		// Jobs that qBittorrent doesn't have yet (fetching the .torrent, or failed early)
		for (const job of jobs) {
			if (job.infoHash || job.status === 'complete') continue;
			downloads.push({
				id: job.id,
				title: job.meta?.title ?? job.title,
				mediaType: job.meta?.mediaType ?? (job.mediaType === 'tv' ? 'tv' : 'movie'),
				tmdbId: job.meta?.tmdbId,
				posterPath: job.meta?.posterPath ?? null,
				progress: 0,
				status: job.status === 'error' ? 'error' : 'fetching',
				downloadSpeed: 0,
				error: job.error
			});
		}

		// Unfinished torrents, plus finished ones still being copied into the library
		for (const t of torrents) {
			const job = jobByHash.get(t.hash);
			const copying = job?.status === 'copying';
			if (t.progress >= 1 && !copying) continue;

			const m = meta[t.hash] ?? job?.meta;
			const state = mapState(t.state);
			downloads.push({
				id: t.hash,
				title: m?.title ?? t.name,
				mediaType: m?.mediaType ?? (t.category === 'tv' ? 'tv' : 'movie'),
				tmdbId: m?.tmdbId,
				posterPath: m?.posterPath ?? null,
				progress: t.progress,
				status: copying ? 'copying' : state === 'error' ? 'error' : 'downloading',
				downloadSpeed: t.dlspeed
			});
		}

		return json({ downloads });
	} catch (err) {
		console.error('[api/downloads] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to list downloads' },
			{ status: 500 }
		);
	}
};
