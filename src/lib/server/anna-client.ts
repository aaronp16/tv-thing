/**
 * Anna's Archive client
 *
 * Scrapes annas-archive.gl for book search results and detail pages.
 * We implement this directly in TypeScript rather than using the archive_of_anna
 * npm package to avoid CJS/ESM friction and the package's unmaintained state.
 */

import type { AnnaSearchResult, AnnaBookDetail } from '$lib/types.js';

const BASE_URL = 'https://annas-archive.gl';

const HEADERS = {
	'User-Agent':
		'Mozilla/5.0 (compatible; book-thing/1.0; +https://github.com/your-repo/book-thing)',
	Accept: 'text/html,application/xhtml+xml',
	'Accept-Language': 'en-US,en;q=0.9'
};

/**
 * Search Anna's Archive for books
 */
export async function searchAnna(
	query: string,
	options: {
		lang?: string;
		ext?: string;
		content?: string;
		sort?: string;
	} = {}
): Promise<AnnaSearchResult[]> {
	const url = new URL(`${BASE_URL}/search`);
	url.searchParams.set('q', query);
	if (options.lang) url.searchParams.set('lang', options.lang);
	if (options.ext) url.searchParams.set('ext', options.ext);
	if (options.content) url.searchParams.set('content', options.content);
	if (options.sort) url.searchParams.set('sort', options.sort);

	const response = await fetch(url.toString(), { headers: HEADERS });

	if (!response.ok) {
		throw new Error(`Anna's Archive search failed: ${response.status} ${response.statusText}`);
	}

	const html = await response.text();
	return parseSearchResults(html);
}

/**
 * Fetch detailed info for a book by MD5 hash
 */
export async function fetchAnnaDetail(md5: string): Promise<AnnaBookDetail> {
	const url = `${BASE_URL}/md5/${md5}`;
	const response = await fetch(url, { headers: HEADERS });

	if (!response.ok) {
		throw new Error(`Anna's Archive fetch failed: ${response.status} ${response.statusText}`);
	}

	const html = await response.text();
	return parseDetailPage(html, md5);
}

// ---------------------------------------------------------------------------
// HTML parsers (no cheerio — use regex on the structured HTML patterns)
// ---------------------------------------------------------------------------

/**
 * Parse search results page HTML into AnnaSearchResult[]
 *
 * Each result is a <div class="flex pt-3 pb-3 border-b ..."> block containing:
 *   - A cover <a href="/md5/{hash}"> with a fallback div that has data-content attrs
 *   - A second <a href="/md5/{hash}" class="... font-semibold text-lg ..."> for the title
 *   - An author <a href="/search?q=..."> following an icon-[mdi--user-edit] span
 *   - A metadata div: "English [en] · AZW3 · 4.5MB · 2017 · ..."
 */
function parseSearchResults(html: string): AnnaSearchResult[] {
	const results: AnnaSearchResult[] = [];
	const seen = new Set<string>();

	// Split on the result container divs
	const blockPattern =
		/<div class="flex\s+pt-3[^"]*">([\s\S]*?)(?=<div class="flex\s+pt-3|<div class="[^"]*mt-6)/g;

	let match: RegExpExecArray | null;
	while ((match = blockPattern.exec(html)) !== null) {
		const block = match[1];

		// Extract md5 from any href="/md5/{hash}" in this block
		const md5Match = /href="\/md5\/([a-f0-9]{32})"/.exec(block);
		if (!md5Match) continue;
		const md5 = md5Match[1];
		if (seen.has(md5)) continue;
		seen.add(md5);

		// Title: the second <a href="/md5/..."> (the title link, class contains font-semibold text-lg)
		const titleLinkMatch =
			/href="\/md5\/[a-f0-9]{32}"[^>]*font-semibold[^>]*>([\s\S]*?)<\/a>/i.exec(block);
		let title = titleLinkMatch ? stripTags(titleLinkMatch[1]).trim() : '';

		// Fallback: data-content on the fallback cover div (title)
		if (!title) {
			const fallbackTitle = /class="[^"]*text-violet-900[^"]*"[^>]*data-content="([^"]*)"/.exec(
				block
			);
			title = fallbackTitle ? decodeHtmlEntities(fallbackTitle[1]).trim() : '';
		}

		if (!title) continue;

		// Authors: link with icon-[mdi--user-edit] inside it
		const authorMatch = /icon-\[mdi--user-edit\][^>]*><\/span>\s*([\s\S]*?)<\/a>/i.exec(block);
		let authors = authorMatch ? stripTags(authorMatch[1]).trim() : '';

		// Fallback: data-content on the fallback cover author div
		if (!authors) {
			const fallbackAuthor = /class="[^"]*text-amber-900[^"]*"[^>]*data-content="([^"]*)"/.exec(
				block
			);
			authors = fallbackAuthor ? decodeHtmlEntities(fallbackAuthor[1]).trim() : '';
		}

		// Publisher: link with icon-[mdi--company] inside it
		const publisherMatch = /icon-\[mdi--company\][^>]*><\/span>\s*([\s\S]*?)<\/a>/i.exec(block);
		let publisher: string | undefined;
		if (publisherMatch) {
			// Strip year suffix e.g. "Tor Books, 2017" → "Tor Books"
			const raw = stripTags(publisherMatch[1])
				.replace(/,\s*\d{4}\s*$/, '')
				.trim();
			// Discard values that look like garbled series/file metadata
			// (contain semicolons, multiple commas, or end in a bare number)
			const looksLikeGarbage =
				raw.includes(';') || (raw.match(/,/g) || []).length > 1 || /,\s*\d+\s*$/.test(raw);
			publisher = raw && !looksLikeGarbage ? raw : undefined;
		}

		// Metadata line: "English [en] · AZW3 · 4.5MB · 2017 · 📗 Book (fiction) · 🚀/zlib · ..."
		// It's in a div with class containing font-semibold text-sm
		const metaMatch =
			/class="[^"]*font-semibold text-sm[^"]*"[^>]*>([\s\S]*?)(?=<div|<a\s|$)/i.exec(block);
		const metaText = metaMatch ? stripTags(metaMatch[1]) : block;

		// Extension
		const extMatch = /\b(epub|pdf|mobi|azw3?|fb2|djvu|doc|docx|txt|rtf|lit|lrf|pdb)\b/i.exec(
			metaText
		);
		const extension = extMatch ? extMatch[1].toLowerCase() : '';

		// File size e.g. "1.2MB", "340KB"
		const sizeMatch = /(\d+(?:\.\d+)?)\s*(KB|MB|GB)/i.exec(metaText);
		let sizeBytes = 0;
		if (sizeMatch) {
			const value = parseFloat(sizeMatch[1]);
			const unit = sizeMatch[2].toUpperCase();
			sizeBytes =
				unit === 'GB'
					? Math.round(value * 1024 * 1024 * 1024)
					: unit === 'MB'
						? Math.round(value * 1024 * 1024)
						: Math.round(value * 1024);
		}

		// Year
		const yearMatch = /\b(19\d{2}|20\d{2})\b/.exec(metaText);
		const year = yearMatch ? parseInt(yearMatch[1]) : undefined;

		// Language e.g. "English [en]"
		const langMatch = /\[\s*([a-z]{2}(?:-[A-Za-z]+)?)\s*\]/i.exec(metaText);
		const language = langMatch ? langMatch[1].toLowerCase() : undefined;

		// Content type: emoji + text e.g. "📗 Book (fiction)", "📕 Book (unknown)", "🎵 Magazine"
		const contentTypeMatch = /[\u{1F300}-\u{1FFFF}]\s+([^·\n]+)/u.exec(metaText);
		const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : undefined;

		// Source libraries: "🚀/zlib" or "🚀/lgli/lgrs/zlib" — strip the 🚀 prefix

		// Cover URL: not in the img src (loaded dynamically) — skip for now
		const coverUrl = undefined;

		results.push({
			md5,
			title,
			authors,
			coverUrl,
			extension,
			sizeBytes,
			year,
			language,
			publisher,
			contentType
		});
	}

	return results;
}

function decodeHtmlEntities(str: string): string {
	return str
		.replace(/&amp;/g, '&')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>');
}

/**
 * Parse a detail page to extract download links and full metadata.
 *
 * The page embeds a JSON blob inside a `.js-technical-details` hidden div.
 */
function parseDetailPage(html: string, md5: string): AnnaBookDetail {
	// Try to extract the embedded JSON metadata
	const jsonMatch =
		/class="[^"]*js-technical-details[^"]*hidden[^"]*"[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i.exec(
			html
		);

	let downloadLinks: AnnaBookDetail['downloadLinks'] = [];

	if (jsonMatch) {
		try {
			const raw = jsonMatch[1].replace(/\s{2,}/g, ' ').trim();
			const meta = JSON.parse(raw);
			const unified = meta?.file_unified_data ?? {};

			const links: AnnaBookDetail['downloadLinks'] = [];
			if (Array.isArray(meta?.additional?.download_urls)) {
				for (const [name, url] of meta.additional.download_urls) {
					let type: AnnaBookDetail['downloadLinks'][number]['type'] = 'other';
					if (String(name).includes('IPFS')) type = 'ipfs';
					else if (String(name).includes('.rs-fork')) type = 'libgen_rs';
					else if (String(name).includes('.li-fork')) type = 'libgen_li';
					else if (String(name).includes('Z-Library')) type = 'zlib';
					links.push({ type, url: String(url), label: String(name) });
				}
			}
			downloadLinks = links;

			return {
				md5,
				title: unified.title_best ?? '',
				authors:
					Array.isArray(unified.author_additional) && unified.author_additional.length > 0
						? unified.author_additional
						: unified.author_best
							? [unified.author_best]
							: [],
				coverUrl: unified.cover_url_best ?? undefined,
				description: unified.stripped_description_best ?? undefined,
				extension: unified.extension_best ?? '',
				publisher: unified.publisher_best ?? undefined,
				year: unified.year_best ? parseInt(unified.year_best) : undefined,
				language: unified.language_best ?? undefined,
				isbn: Array.isArray(unified.sanitized_isbns) ? unified.sanitized_isbns : [],
				downloadLinks
			};
		} catch {
			// Fall through to link-scraping fallback
		}
	}

	// Fallback: scrape download links directly from the page HTML
	// Look for <a href="..."> elements that look like download links
	const linkPattern =
		/<a[^>]+href="(https?:\/\/[^"]+)"[^>]*>([^<]*(?:download|IPFS|Libgen|Z-Library)[^<]*)<\/a>/gi;
	let linkMatch: RegExpExecArray | null;
	while ((linkMatch = linkPattern.exec(html)) !== null) {
		const [, url, label] = linkMatch;
		let type: AnnaBookDetail['downloadLinks'][number]['type'] = 'other';
		if (label.includes('IPFS')) type = 'ipfs';
		else if (label.toLowerCase().includes('libgen')) type = 'libgen_rs';
		downloadLinks.push({ type, url, label: label.trim() });
	}

	// Minimal fallback result when JSON parsing failed
	const titleMatch = /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html);
	return {
		md5,
		title: titleMatch ? stripTags(titleMatch[1]).trim() : md5,
		authors: [],
		extension: '',
		isbn: [],
		downloadLinks
	};
}

function stripTags(html: string): string {
	return decodeHtmlEntities(html.replace(/<[^>]+>/g, ''));
}
