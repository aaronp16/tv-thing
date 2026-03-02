/**
 * GET /api/anna/progress/[id]
 *
 * SSE stream for Anna's Archive HTTP download progress.
 *
 * Events:
 * - { type: 'connected', jobId: string }
 * - { type: 'progress', ...HttpDownloadJob }
 * - { type: 'done', status: 'complete' | 'error', error?: string }
 */

import type { RequestHandler } from './$types';
import { subscribeToAnnaProgress, getAnnaJobStatus } from '$lib/server/anna-downloader';

export const GET: RequestHandler = async ({ params }) => {
	const jobId = params.id;

	const job = getAnnaJobStatus(jobId);
	if (!job) {
		return new Response('Job not found', { status: 404 });
	}

	const stream = new ReadableStream({
		start(controller) {
			const encoder = new TextEncoder();

			controller.enqueue(
				encoder.encode(`data: ${JSON.stringify({ type: 'connected', jobId })}\n\n`)
			);

			const unsubscribe = subscribeToAnnaProgress(jobId, (jobUpdate) => {
				try {
					const data = JSON.stringify({ type: 'progress', ...jobUpdate });
					controller.enqueue(encoder.encode(`data: ${data}\n\n`));

					if (jobUpdate.status === 'complete' || jobUpdate.status === 'error') {
						controller.enqueue(
							encoder.encode(
								`data: ${JSON.stringify({ type: 'done', status: jobUpdate.status, error: jobUpdate.error })}\n\n`
							)
						);
						unsubscribe();
						controller.close();
					}
				} catch {
					unsubscribe();
				}
			});

			return () => {
				unsubscribe();
			};
		}
	});

	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			Connection: 'keep-alive'
		}
	});
};
