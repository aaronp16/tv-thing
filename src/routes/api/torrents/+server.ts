/**
 * GET /api/torrents
 *
 * List all active torrents (downloading + seeding) from qBittorrent.
 *
 * Response:
 * {
 *   torrents: TorrentInfo[]
 *   activeJobs: DownloadJob[]
 * }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTorrents, mapState } from '$lib/server/qbittorrent-client';
import { getActiveJobs } from '$lib/server/downloader';
import { env } from '$lib/server/env';
import type { TorrentInfo } from '$lib/types';

export const GET: RequestHandler = async () => {
	try {
		// Get torrents from qBittorrent (filtered by our category)
		const qbTorrents = await getTorrents({ category: env.QB_CATEGORY });

		// Map to our TorrentInfo format
		const torrents: TorrentInfo[] = qbTorrents.map((t) => ({
			infoHash: t.hash,
			name: t.name,
			progress: t.progress,
			downloadSpeed: t.dlspeed,
			uploadSpeed: t.upspeed,
			numPeers: t.num_seeds + t.num_leechs,
			downloaded: t.downloaded,
			uploaded: t.uploaded,
			size: t.size,
			ratio: t.ratio,
			status: mapState(t.state),
			files: [], // qBittorrent requires separate API call for files
			addedAt: new Date(t.added_on * 1000).toISOString()
		}));

		const activeJobs = getActiveJobs();

		return json({ torrents, activeJobs });
	} catch (err) {
		console.error('[api/torrents] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to get torrents' },
			{ status: 500 }
		);
	}
};
