/**
 * Active downloads, polled from /api/downloads — every 2s while something is
 * downloading, every 15s otherwise. Shared by the library panels.
 */

import { get, writable } from 'svelte/store';
import type { ActiveDownload } from '$lib/types';

export const activeDownloads = writable<ActiveDownload[]>([]);

/**
 * Library tab to switch to, set when a download starts. `at` makes every
 * request distinct, so the same tab twice in a row still triggers.
 */
export const libraryFocus = writable<{ tab: 'movies' | 'tvshows'; at: number } | null>(null);

const BUSY_INTERVAL = 2000;
const IDLE_INTERVAL = 15000;

let timer: ReturnType<typeof setTimeout> | undefined;
let started = false;

async function poll(): Promise<void> {
	try {
		const res = await fetch('/api/downloads');
		if (res.ok) activeDownloads.set((await res.json()).downloads);
	} catch {
		// Keep the last known state; try again next tick
	}
	clearTimeout(timer);
	timer = setTimeout(poll, get(activeDownloads).length > 0 ? BUSY_INTERVAL : IDLE_INTERVAL);
}

/** Start polling (safe to call more than once) */
export function startDownloadPolling(): void {
	if (started) return;
	started = true;
	poll();
}

/** Poll now, e.g. straight after starting a download */
export function refreshDownloads(): void {
	clearTimeout(timer);
	poll();
}
