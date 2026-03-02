/**
 * POST /api/download
 *
 * Start a download for a torrent from TorrentLeech.
 *
 * Request body:
 * {
 *   torrentId: number;     // TorrentLeech fid
 *   filename: string;      // TorrentLeech torrent filename
 *   title: string;         // Display title
 *   mediaType: 'tv' | 'movie';
 * }
 *
 * Response:
 * {
 *   jobId: string;    // Use with /api/progress/[id] for SSE updates
 * }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { startDownload } from '$lib/server/downloader';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { filename, title, mediaType } = body;
		const torrentId = Number(body.torrentId);

		if (!torrentId || !Number.isFinite(torrentId)) {
			return json({ error: 'torrentId is required and must be a number' }, { status: 400 });
		}

		if (!filename || typeof filename !== 'string') {
			return json({ error: 'filename is required and must be a string' }, { status: 400 });
		}

		if (!title || typeof title !== 'string') {
			return json({ error: 'title is required and must be a string' }, { status: 400 });
		}

		if (!mediaType || !['tv', 'movie'].includes(mediaType)) {
			return json({ error: 'mediaType is required and must be "tv" or "movie"' }, { status: 400 });
		}

		const jobId = await startDownload(torrentId, filename, title, mediaType);

		return json({ jobId });
	} catch (err) {
		console.error('[api/download] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to start download' },
			{ status: 500 }
		);
	}
};
