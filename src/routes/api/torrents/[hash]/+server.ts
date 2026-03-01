/**
 * DELETE /api/torrents/[hash]
 *
 * Remove a torrent by its hash from qBittorrent.
 *
 * Query params:
 * - deleteFiles: 'true' to also delete downloaded files (default: false)
 *
 * Response:
 * { success: true } or { error: string }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteTorrent, getTorrent, mapState } from '$lib/server/qbittorrent-client';
import type { TorrentInfo } from '$lib/types';

export const DELETE: RequestHandler = async ({ params, url }) => {
	try {
		const { hash } = params;

		if (!hash) {
			return json({ error: 'Hash is required' }, { status: 400 });
		}

		// Check if torrent exists
		const torrent = await getTorrent(hash);
		if (!torrent) {
			return json({ error: 'Torrent not found' }, { status: 404 });
		}

		// Check for deleteFiles query param
		const deleteFiles = url.searchParams.get('deleteFiles') === 'true';

		await deleteTorrent(hash, deleteFiles);

		return json({ success: true });
	} catch (err) {
		console.error('[api/torrents/[hash]] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to remove torrent' },
			{ status: 500 }
		);
	}
};

/**
 * GET /api/torrents/[hash]
 *
 * Get details for a specific torrent.
 */
export const GET: RequestHandler = async ({ params }) => {
	try {
		const { hash } = params;

		if (!hash) {
			return json({ error: 'Hash is required' }, { status: 400 });
		}

		const t = await getTorrent(hash);
		if (!t) {
			return json({ error: 'Torrent not found' }, { status: 404 });
		}

		// Map to our TorrentInfo format
		const torrent: TorrentInfo = {
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
			files: [],
			addedAt: new Date(t.added_on * 1000).toISOString()
		};

		return json({ torrent });
	} catch (err) {
		console.error('[api/torrents/[hash]] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to get torrent' },
			{ status: 500 }
		);
	}
};
