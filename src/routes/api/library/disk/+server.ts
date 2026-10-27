import { json } from '@sveltejs/kit';
import { statfs } from 'node:fs/promises';
import type { RequestHandler } from './$types';
import { env } from '$lib/server/env';

/** Free/total space on the filesystem holding MEDIA_DIR */
export const GET: RequestHandler = async () => {
	try {
		const stats = await statfs(env.MEDIA_DIR);
		const total = stats.blocks * stats.bsize;
		const free = stats.bavail * stats.bsize;
		return json({ total, free, used: total - free });
	} catch (err) {
		console.error('[api/library/disk] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to read disk space' },
			{ status: 500 }
		);
	}
};
