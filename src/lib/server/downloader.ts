/**
 * Download orchestrator
 *
 * Coordinates fetching .torrent files from TorrentLeech and adding them to qBittorrent.
 * Tracks download jobs and provides progress updates via subscriptions.
 * Copies completed downloads to Jellyfin media library.
 */

import { downloadTorrentFile } from './tl-client.js';
import { addTorrent, getTorrent, mapState } from './qbittorrent-client.js';
import { copyToLibrary } from './media-library.js';
import type { DownloadJob, MediaType } from '$lib/types.js';

/** Active download jobs */
const activeJobs = new Map<string, DownloadJob>();

/** Progress listeners for SSE streaming */
const progressListeners = new Map<string, Set<(job: DownloadJob) => void>>();

/**
 * Generate a unique job ID
 */
function generateJobId(): string {
	return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Notify all listeners of a job update
 */
function notifyProgress(jobId: string, job: DownloadJob): void {
	const listeners = progressListeners.get(jobId);
	if (listeners) {
		for (const listener of listeners) {
			listener(job);
		}
	}
}

/**
 * Start a download job
 *
 * @param torrentId - TorrentLeech torrent fid
 * @param filename - TorrentLeech torrent filename (needed for download URL)
 * @param title - Display title
 * @param mediaType - 'tv' or 'movie'
 * @returns Job ID for tracking progress
 */
export async function startDownload(
	torrentId: number,
	filename: string,
	title: string,
	mediaType: MediaType
): Promise<string> {
	const jobId = generateJobId();

	const job: DownloadJob = {
		id: jobId,
		torrentId,
		title,
		mediaType,
		status: 'fetching',
		progress: 0,
		downloadSpeed: 0,
		uploadSpeed: 0,
		numPeers: 0
	};

	activeJobs.set(jobId, job);
	notifyProgress(jobId, job);

	// Start download in background
	(async () => {
		try {
			// Step 1: Fetch .torrent file from TorrentLeech
			console.log(`[downloader] Fetching torrent for ${torrentId}: ${title}`);
			const torrentBuffer = await downloadTorrentFile(torrentId, filename);

			// Step 2: Add to qBittorrent
			job.status = 'downloading';
			notifyProgress(jobId, job);

			console.log(`[downloader] Adding torrent to qBittorrent: ${title}`);
			const category = mediaType === 'tv' ? 'tv' : 'movies';
			const hash = await addTorrent(torrentBuffer, { category });
			job.infoHash = hash;

			// Step 3: Set up progress polling
			const pollInterval = setInterval(async () => {
				try {
					const torrent = await getTorrent(hash);
					if (!torrent) {
						console.warn(`[downloader] Torrent not found in qBittorrent: ${hash}`);
						clearInterval(pollInterval);
						return;
					}

					console.log(
						`[downloader] Poll: state=${torrent.state} progress=${torrent.progress} content_path=${torrent.content_path}`
					);

					job.progress = torrent.progress;
					job.downloadSpeed = torrent.dlspeed;
					job.uploadSpeed = torrent.upspeed;
					job.numPeers = torrent.num_seeds + torrent.num_leechs;

					const status = mapState(torrent.state);

					if (status === 'seeding' || torrent.progress >= 1) {
						// Step 4: Copy to Jellyfin library
						job.status = 'copying';
						job.progress = 1;
						notifyProgress(jobId, job);
						clearInterval(pollInterval);
						console.log(`[downloader] Download complete, copying to library: ${title}`);

						if (torrent.content_path) {
							try {
								// qBittorrent sees /data/torrents, tv-thing mounts the same dir at /torrents
								const localPath = torrent.content_path.replace('/data/torrents', '/torrents');
								console.log(
									`[downloader] Translated path: ${torrent.content_path} -> ${localPath}`
								);
								await copyToLibrary(localPath, mediaType);
								console.log(`[downloader] Copied to library: ${title}`);
							} catch (err) {
								console.error(`[downloader] Copy to library failed:`, err);
								// Don't fail the whole job if copy fails — torrent is still seeding
							}
						} else {
							console.warn(`[downloader] content_path is empty for torrent: ${hash}`);
						}

						job.status = 'complete';
						notifyProgress(jobId, job);

						// Clean up job after a delay (keep for SSE to report completion)
						setTimeout(() => {
							activeJobs.delete(jobId);
							progressListeners.delete(jobId);
						}, 30000);
					} else if (status === 'error') {
						job.status = 'error';
						job.error = `Torrent in error state: ${torrent.state}`;
						notifyProgress(jobId, job);
						clearInterval(pollInterval);
					} else {
						notifyProgress(jobId, job);
					}
				} catch (err) {
					console.error(`[downloader] Error polling torrent status:`, err);
				}
			}, 2000);
		} catch (err) {
			job.status = 'error';
			job.error = err instanceof Error ? err.message : 'Download failed';
			notifyProgress(jobId, job);
			console.error(`[downloader] Failed to start download for ${title}:`, job.error);

			// Clean up failed job after a delay
			setTimeout(() => {
				activeJobs.delete(jobId);
				progressListeners.delete(jobId);
			}, 30000);
		}
	})();

	return jobId;
}

/**
 * Get the current status of a download job
 */
export function getJobStatus(jobId: string): DownloadJob | undefined {
	return activeJobs.get(jobId);
}

/**
 * Get all active download jobs
 */
export function getActiveJobs(): DownloadJob[] {
	return Array.from(activeJobs.values());
}

/**
 * Subscribe to progress updates for a job
 *
 * @param jobId - The job ID to subscribe to
 * @param listener - Callback for progress updates
 * @returns Unsubscribe function
 */
export function subscribeToProgress(
	jobId: string,
	listener: (job: DownloadJob) => void
): () => void {
	if (!progressListeners.has(jobId)) {
		progressListeners.set(jobId, new Set());
	}

	progressListeners.get(jobId)!.add(listener);

	// Send current state immediately
	const job = activeJobs.get(jobId);
	if (job) {
		listener(job);
	}

	// Return unsubscribe function
	return () => {
		progressListeners.get(jobId)?.delete(listener);
	};
}
