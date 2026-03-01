/**
 * GET /api/library
 *
 * Scan and return all ebook files in the library.
 *
 * Response:
 * {
 *   files: LibraryFile[];
 *   totalSize: number;
 *   totalFiles: number;
 * }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { scanLibrary, formatBytes } from '$lib/server/library';

export const GET: RequestHandler = async () => {
	try {
		const result = await scanLibrary();

		return json({
			...result,
			totalSizeFormatted: formatBytes(result.totalSize)
		});
	} catch (err) {
		console.error('[api/library] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to scan library' },
			{ status: 500 }
		);
	}
};
