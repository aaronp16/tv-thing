/**
 * Calibre-Web API client
 *
 * Handles authentication and book uploads via Calibre-Web's web interface.
 * Uses session cookie auth (the only auth mechanism available for uploads).
 *
 * Requires in Calibre-Web admin:
 *   - Admin → Edit Basic Configuration → Feature Configuration → Enable Uploads ✓
 *   - Admin → Edit User → Upload permission ✓
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { env } from './env.js';

/** Session cookie from Calibre-Web login */
let sessionCookie: string | null = null;

function getBaseUrl(): string {
	return env.CALIBRE_WEB_URL.replace(/\/$/, '');
}

/**
 * Login to Calibre-Web and store the session cookie.
 */
async function login(): Promise<void> {
	const url = `${getBaseUrl()}/login`;

	const response = await fetch(url, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			username: env.CALIBRE_WEB_USERNAME,
			password: env.CALIBRE_WEB_PASSWORD,
			next: '/'
		}),
		redirect: 'manual' // Don't follow redirect — we just want the Set-Cookie header
	});

	// Calibre-Web redirects on successful login (302), returns 200 on failure
	const setCookie = response.headers.get('set-cookie');
	if (!setCookie) {
		throw new Error('Calibre-Web login failed: no session cookie in response');
	}

	const match = setCookie.match(/session=([^;]+)/);
	if (!match) {
		throw new Error('Calibre-Web login failed: could not parse session cookie');
	}

	sessionCookie = match[1];
	console.log('[calibre] Logged in successfully');
}

/**
 * Upload a book file to Calibre-Web.
 *
 * Calibre-Web extracts title/author/metadata automatically from the file's
 * embedded metadata (EPUB OPF, PDF info, etc.) — no need to pass them separately.
 *
 * @param filePath - Absolute path to the ebook file to upload
 * @returns The Calibre-Web book URL (e.g. /book/42)
 */
export async function uploadBookToCalibre(filePath: string): Promise<string> {
	if (!env.CALIBRE_WEB_URL) {
		throw new Error('CALIBRE_WEB_URL is not configured');
	}

	// Login if we don't have a session
	if (!sessionCookie) {
		await login();
	}

	const fileBuffer = await fs.readFile(filePath);
	const filename = path.basename(filePath);
	const ext = path.extname(filename).toLowerCase().slice(1); // e.g. "epub"

	// Build multipart body manually — same approach as qbittorrent-client.ts
	// to avoid Node.js FormData/undici issues with binary data
	const boundary = `----book-thing-calibre-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const CRLF = '\r\n';

	const parts: Buffer[] = [];

	parts.push(Buffer.from(
		`--${boundary}${CRLF}` +
		`Content-Disposition: form-data; name="btn-upload"; filename="${filename}"${CRLF}` +
		`Content-Type: application/${ext}${CRLF}` +
		CRLF
	));
	parts.push(fileBuffer);
	parts.push(Buffer.from(CRLF));
	parts.push(Buffer.from(`--${boundary}--${CRLF}`));

	const body = Buffer.concat(parts);

	const response = await fetch(`${getBaseUrl()}/upload`, {
		method: 'POST',
		headers: {
			'Content-Type': `multipart/form-data; boundary=${boundary}`,
			'Cookie': `session=${sessionCookie}`,
			'X-Requested-With': 'XMLHttpRequest' // Required for JSON response
		},
		body
	});

	// Session expired — re-login and retry once
	if (response.status === 401 || response.redirected && response.url.includes('/login')) {
		console.log('[calibre] Session expired, re-logging in...');
		sessionCookie = null;
		await login();
		return uploadBookToCalibre(filePath);
	}

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`Calibre-Web upload failed: ${response.status} ${text.slice(0, 200)}`);
	}

	const result = await response.json() as { location?: string; error?: string };

	if (result.error) {
		throw new Error(`Calibre-Web upload error: ${result.error}`);
	}

	const location = result.location || '/';
	console.log(`[calibre] Uploaded successfully: ${filename} → ${location}`);
	return location;
}
