/**
 * POST /api/anna/download
 *
 * Start an HTTP download for a book from Anna's Archive.
 *
 * Request body:
 * {
 *   md5: string;      // Anna's Archive MD5 hash
 *   title: string;    // Book title (for display and filename)
 *   authors: string;  // Author string (for filename)
 * }
 *
 * Response:
 * {
 *   jobId: string;    // Use with /api/anna/progress/[id] for SSE updates
 * }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { startAnnaDownload } from '$lib/server/anna-downloader';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { md5, title, authors } = body;

		if (!md5 || typeof md5 !== 'string') {
			return json({ error: 'md5 is required and must be a string' }, { status: 400 });
		}
		if (!title || typeof title !== 'string') {
			return json({ error: 'title is required and must be a string' }, { status: 400 });
		}

		const jobId = await startAnnaDownload(md5, title, authors ?? '');
		return json({ jobId });
	} catch (err) {
		console.error('[api/anna/download] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to start download' },
			{ status: 500 }
		);
	}
};
