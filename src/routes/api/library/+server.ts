/**
 * GET /api/library
 *
 * Read books from Calibre's metadata.db, sorted by most recently added.
 * Returns book id, title, author, has_cover, path, and timestamp.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$lib/server/env';
import * as path from 'path';

let _db: any = null;

async function getDb() {
	if (_db) return _db;
	const dbPath = path.join(env.BOOKS_DIR, 'metadata.db');
	const { DatabaseSync } = await import('node:sqlite');
	_db = new DatabaseSync(dbPath);

	// Calibre triggers need these functions
	const { randomUUID } = await import('crypto');
	_db.function('title_sort', (title: string) => {
		const m = (title ?? '').match(/^(The|A|An)\s+/i);
		if (!m) return title ?? '';
		return (title ?? '').slice(m[0].length) + ', ' + m[1];
	});
	_db.function('uuid4', () => randomUUID());

	return _db;
}

export const GET: RequestHandler = async () => {
	try {
		const db = await getDb();

		const books = db.prepare(`
			SELECT b.id, b.title, b.has_cover, b.path, b.timestamp,
			       (SELECT GROUP_CONCAT(a.name, ', ')
			        FROM books_authors_link bal
			        JOIN authors a ON a.id = bal.author
			        WHERE bal.book = b.id) AS authors
			FROM   books b
			ORDER BY b.timestamp DESC
		`).all() as Array<{
			id: number;
			title: string;
			has_cover: number;
			path: string;
			timestamp: string;
			authors: string | null;
		}>;

		// Deduplicate by title, keeping the highest ID (most recently added copy)
		const seen = new Set<string>();
		const deduped = books.filter(b => {
			const key = b.title.toLowerCase();
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});

		return json({
			books: deduped.map(b => ({
				id: b.id,
				title: b.title,
				author: b.authors ?? 'Unknown',
				hasCover: b.has_cover === 1,
				path: b.path,
				addedAt: b.timestamp
			})),
			totalBooks: deduped.length
		});
	} catch (err) {
		console.error('[api/library] Error:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to read library' },
			{ status: 500 }
		);
	}
};
