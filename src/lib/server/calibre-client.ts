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

/** All cookies collected across the login flow, keyed by cookie name */
let cookieJar: Map<string, string> = new Map();

function getBaseUrl(): string {
	return env.CALIBRE_WEB_URL.replace(/\/$/, '');
}

/** Parse all Set-Cookie headers from a response and merge into the jar */
function collectCookies(response: Response): void {
	// Node's fetch (undici) exposes repeated headers via getSetCookie() if available,
	// otherwise we fall back to iterating headers entries.
	const raw: string[] = [];
	if (typeof (response.headers as any).getSetCookie === 'function') {
		raw.push(...(response.headers as any).getSetCookie());
	} else {
		for (const [name, value] of response.headers.entries()) {
			if (name.toLowerCase() === 'set-cookie') raw.push(value);
		}
	}
	for (const cookie of raw) {
		const [pair] = cookie.split(';');
		const eq = pair.indexOf('=');
		if (eq === -1) continue;
		const name = pair.slice(0, eq).trim();
		const value = pair.slice(eq + 1).trim();
		cookieJar.set(name, value);
	}
	console.log(`[calibre] Cookie jar now has: ${[...cookieJar.keys()].join(', ')}`);
}

/** Serialize the cookie jar into a Cookie header value */
function buildCookieHeader(): string {
	return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

/**
 * Login to Calibre-Web and populate the cookie jar.
 * Calibre-Web uses Flask-WTF CSRF protection on the login form itself,
 * so we GET the login page first to get the csrf_token + initial session cookie,
 * then POST credentials. The authenticated session + csrftoken cookies are
 * then stored for subsequent requests.
 */
async function login(): Promise<void> {
	const baseUrl = getBaseUrl();
	cookieJar = new Map();

	// Step 1: GET the login page — captures initial session + csrftoken cookies
	console.log(`[calibre] Fetching login page: ${baseUrl}/login`);
	const getResponse = await fetch(`${baseUrl}/login`, { method: 'GET' });
	console.log(`[calibre] Login page response: ${getResponse.status}`);
	collectCookies(getResponse);

	const html = await getResponse.text();
	const csrfMatch = html.match(/name="csrf_token"[^>]*value="([^"]+)"/);
	if (!csrfMatch) {
		throw new Error(`Calibre-Web: could not find csrf_token in login page (status ${getResponse.status})`);
	}
	const csrfToken = csrfMatch[1];
	console.log(`[calibre] Got login CSRF token: ${csrfToken.slice(0, 10)}...`);

	// Step 2: POST login — captures authenticated session cookie
	console.log(`[calibre] Logging in as "${env.CALIBRE_WEB_USERNAME}"...`);
	const postResponse = await fetch(`${baseUrl}/login`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Cookie': buildCookieHeader()
		},
		body: new URLSearchParams({
			username: env.CALIBRE_WEB_USERNAME,
			password: env.CALIBRE_WEB_PASSWORD,
			next: '/',
			csrf_token: csrfToken
		}),
		redirect: 'manual'
	});

	console.log(`[calibre] Login POST response: ${postResponse.status} ${postResponse.statusText}`);
	collectCookies(postResponse);

	if (postResponse.status !== 302) {
		throw new Error(`Calibre-Web login failed: expected 302 redirect, got ${postResponse.status}`);
	}
	if (!cookieJar.has('session')) {
		throw new Error(`Calibre-Web login failed: no session cookie after login`);
	}

	console.log('[calibre] Logged in successfully');
}

function isLoggedIn(): boolean {
	return cookieJar.has('session');
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
		console.warn('[calibre] CALIBRE_WEB_URL not set — skipping upload');
		throw new Error('CALIBRE_WEB_URL is not configured');
	}

	console.log(`[calibre] Starting upload: ${filePath}`);

	if (!isLoggedIn()) {
		await login();
	} else {
		console.log('[calibre] Reusing existing session');
	}

	let fileBuffer: Buffer;
	try {
		fileBuffer = await fs.readFile(filePath);
		console.log(`[calibre] Read file: ${filePath} (${fileBuffer.length} bytes)`);
	} catch (err) {
		throw new Error(`[calibre] Could not read file at ${filePath}: ${err}`);
	}

	const filename = path.basename(filePath);
	const ext = path.extname(filename).toLowerCase().slice(1); // e.g. "epub"
	console.log(`[calibre] Uploading "${filename}" (format: ${ext}) to ${getBaseUrl()}/upload`);

	// Build multipart body manually — same approach as qbittorrent-client.ts
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
			'Cookie': buildCookieHeader(),
			'X-Requested-With': 'XMLHttpRequest'
		},
		body
	});

	console.log(`[calibre] Upload response: ${response.status} ${response.statusText}`);

	// Session expired — clear jar, re-login, retry once
	if (response.status === 401 || response.status === 403) {
		console.log('[calibre] Auth error, re-logging in...');
		cookieJar = new Map();
		await login();
		return uploadBookToCalibre(filePath);
	}

	const responseText = await response.text();
	console.log(`[calibre] Response body: ${responseText.slice(0, 500)}`);

	if (!response.ok) {
		throw new Error(`Calibre-Web upload failed: ${response.status} ${responseText.slice(0, 200)}`);
	}

	let result: { location?: string; error?: string };
	try {
		result = JSON.parse(responseText);
	} catch {
		throw new Error(`Calibre-Web upload returned non-JSON: ${responseText.slice(0, 200)}`);
	}

	if (result.error) {
		throw new Error(`Calibre-Web upload error: ${result.error}`);
	}

	const location = result.location || '/';
	console.log(`[calibre] Uploaded successfully: ${filename} → ${location}`);
	return location;
}
