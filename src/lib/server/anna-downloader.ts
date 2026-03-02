/**
 * Anna's Archive HTTP downloader
 *
 * Fetches a book file from Anna's Archive download links, streams it to disk,
 * and reports progress via subscriptions (mirrors the MAM downloader pattern).
 */

import { createWriteStream } from 'fs';
import { mkdir } from 'fs/promises';
import { join, extname, basename } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { fetchAnnaDetail } from './anna-client.js';
import { env } from './env.js';
import type { HttpDownloadJob } from '$lib/types.js';

/** Active HTTP download jobs */
const activeJobs = new Map<string, HttpDownloadJob>();

/** Progress listeners for SSE streaming */
const progressListeners = new Map<string, Set<(job: HttpDownloadJob) => void>>();

function generateJobId(): string {
	return `anna-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function notifyProgress(jobId: string, job: HttpDownloadJob): void {
	const listeners = progressListeners.get(jobId);
	if (listeners) {
		for (const listener of listeners) {
			listener(job);
		}
	}
}

/**
 * Sanitise a string for use as a filename
 */
function sanitiseFilename(name: string): string {
	return name
		.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
		.replace(/\s+/g, ' ')
		.trim()
		.substring(0, 200);
}

/**
 * Try each download URL in priority order, returning the first successful response.
 * Priority: libgen_rs > libgen_li > ipfs > zlib > other
 */
async function fetchFirstWorkingUrl(
	links: { type: string; url: string }[]
): Promise<{ response: Response; url: string } | null> {
	const priority = ['libgen_rs', 'libgen_li', 'ipfs', 'zlib', 'other'];
	const sorted = [...links].sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));

	for (const link of sorted) {
		try {
			const response = await fetch(link.url, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (compatible; book-thing/1.0)',
					Accept: '*/*'
				},
				redirect: 'follow'
			});
			if (response.ok && response.body) {
				return { response, url: link.url };
			}
		} catch {
			// Try next link
		}
	}
	return null;
}

/**
 * Start an HTTP download from Anna's Archive
 *
 * @param md5 - Anna's Archive MD5 hash
 * @param title - Book title (for display and filename)
 * @param authors - Author string (for filename)
 * @returns Job ID for tracking progress
 */
export async function startAnnaDownload(
	md5: string,
	title: string,
	authors: string
): Promise<string> {
	const jobId = generateJobId();

	const job: HttpDownloadJob = {
		id: jobId,
		source: 'anna',
		md5,
		title,
		authors,
		extension: '',
		status: 'downloading',
		progress: 0,
		bytesDownloaded: 0,
		totalBytes: -1,
		downloadSpeed: 0
	};

	activeJobs.set(jobId, job);
	notifyProgress(jobId, job);

	// Run in background
	(async () => {
		try {
			// Step 1: Fetch detail page to get download links
			console.log(`[anna-downloader] Fetching detail for ${md5}: ${title}`);
			const detail = await fetchAnnaDetail(md5);

			if (detail.downloadLinks.length === 0) {
				throw new Error('No download links found for this book');
			}

			job.extension = detail.extension || 'epub';
			notifyProgress(jobId, job);

			// Step 2: Try download links in priority order
			const result = await fetchFirstWorkingUrl(detail.downloadLinks);
			if (!result) {
				throw new Error('All download links failed');
			}

			const { response } = result;
			const contentLength = response.headers.get('content-length');
			job.totalBytes = contentLength ? parseInt(contentLength) : -1;

			// Determine file extension from Content-Disposition or URL or detail
			const contentDisp = response.headers.get('content-disposition') ?? '';
			const dispMatch = /filename[^;=\n]*=["']?([^"';\n]+)/i.exec(contentDisp);
			const dispExt = dispMatch ? extname(dispMatch[1]).replace('.', '') : '';
			const urlExt = extname(new URL(result.url).pathname).replace('.', '');
			job.extension = dispExt || urlExt || detail.extension || 'epub';

			// Step 3: Stream to disk
			const booksDir = env.BOOKS_DIR;
			await mkdir(booksDir, { recursive: true });

			const safeTitle = sanitiseFilename(title);
			const safeAuthors = sanitiseFilename(authors);
			const filename = safeAuthors
				? `${safeTitle} - ${safeAuthors}.${job.extension}`
				: `${safeTitle}.${job.extension}`;
			const destPath = join(booksDir, filename);

			console.log(`[anna-downloader] Streaming to ${destPath}`);

			const writeStream = createWriteStream(destPath);

			let bytesDownloaded = 0;
			let lastSpeedCheck = Date.now();
			let bytesAtLastCheck = 0;

			// Wrap the web ReadableStream in a Node.js Readable
			const nodeReadable = Readable.fromWeb(response.body as import('stream/web').ReadableStream);

			nodeReadable.on('data', (chunk: Buffer) => {
				bytesDownloaded += chunk.length;
				job.bytesDownloaded = bytesDownloaded;

				// Update speed every ~500ms
				const now = Date.now();
				const elapsed = now - lastSpeedCheck;
				if (elapsed >= 500) {
					job.downloadSpeed = Math.round(((bytesDownloaded - bytesAtLastCheck) / elapsed) * 1000);
					bytesAtLastCheck = bytesDownloaded;
					lastSpeedCheck = now;
				}

				if (job.totalBytes > 0) {
					job.progress = Math.min(bytesDownloaded / job.totalBytes, 1);
				}

				notifyProgress(jobId, job);
			});

			await pipeline(nodeReadable, writeStream);

			job.status = 'complete';
			job.progress = 1;
			job.bytesDownloaded = bytesDownloaded;
			job.downloadSpeed = 0;
			notifyProgress(jobId, job);

			console.log(`[anna-downloader] Complete: ${filename}`);

			// Clean up after a delay (keep job alive long enough for SSE to report completion)
			setTimeout(() => {
				activeJobs.delete(jobId);
				progressListeners.delete(jobId);
			}, 30000);
		} catch (err) {
			job.status = 'error';
			job.error = err instanceof Error ? err.message : 'Download failed';
			notifyProgress(jobId, job);
			console.error(`[anna-downloader] Failed for ${title}:`, job.error);

			setTimeout(() => {
				activeJobs.delete(jobId);
				progressListeners.delete(jobId);
			}, 30000);
		}
	})();

	return jobId;
}

export function getAnnaJobStatus(jobId: string): HttpDownloadJob | undefined {
	return activeJobs.get(jobId);
}

export function getActiveAnnaJobs(): HttpDownloadJob[] {
	return Array.from(activeJobs.values());
}

export function subscribeToAnnaProgress(
	jobId: string,
	listener: (job: HttpDownloadJob) => void
): () => void {
	if (!progressListeners.has(jobId)) {
		progressListeners.set(jobId, new Set());
	}
	progressListeners.get(jobId)!.add(listener);

	// Send current state immediately
	const job = activeJobs.get(jobId);
	if (job) listener(job);

	return () => {
		progressListeners.get(jobId)?.delete(listener);
	};
}
