/**
 * Calibre library integration — writes directly to Calibre's metadata.db
 *
 * Calibre's library structure:
 *   /books/
 *     Author Name/
 *       Title (book_id)/
 *         Title - Author Name.epub   ← the actual file
 *     metadata.db                    ← SQLite database
 *
 * We insert rows into books, authors, books_authors_link, and data,
 * then move the already-copied flat file into the correct subdirectory.
 *
 * Uses node:sqlite (Node 22 built-in, experimental) — no extra dependencies.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { unzipSync, strFromU8 } from 'fflate';
import { env } from './env.js';

// node:sqlite is experimental in Node 22 — lazy-init so the warning fires once at startup
let _db: any = null;

function getDb() {
	if (_db) return _db;
	const dbPath = path.join(env.BOOKS_DIR, 'metadata.db');
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const { DatabaseSync } = require('node:sqlite');
	_db = new DatabaseSync(dbPath);
	return _db;
}

/**
 * Derive a safe directory/filename component from a string.
 * Replaces characters illegal on most filesystems, collapses whitespace.
 */
function sanitize(str: string): string {
	return str
		.replace(/[\\/:*?"<>|]/g, '_')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 80);
}

/**
 * Read title and author from an EPUB's OPF metadata.
 * Falls back to filename parsing if the EPUB can't be read or is missing metadata.
 */
async function readEpubMeta(filePath: string): Promise<{ title: string; author: string }> {
	const filename = path.basename(filePath);
	try {
		const buf = await fs.readFile(filePath);
		const zip = unzipSync(new Uint8Array(buf));

		// Step 1: parse META-INF/container.xml to find the OPF path
		const containerXml = zip['META-INF/container.xml'];
		if (!containerXml) throw new Error('No META-INF/container.xml');
		const containerStr = strFromU8(containerXml);
		const opfMatch = containerStr.match(/full-path="([^"]+\.opf)"/i);
		if (!opfMatch) throw new Error('No OPF path in container.xml');
		const opfPath = opfMatch[1];

		// Step 2: parse the OPF file for dc:title and dc:creator
		const opfData = zip[opfPath];
		if (!opfData) throw new Error(`OPF file not found in zip: ${opfPath}`);
		const opf = strFromU8(opfData);

		const titleMatch = opf.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/i);
		const authorMatch = opf.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/i);

		const title = titleMatch?.[1]?.trim() || null;
		const author = authorMatch?.[1]?.trim() || null;

		if (title && author) {
			console.log(`[calibre-db] EPUB metadata: title="${title}" author="${author}"`);
			return { title, author };
		}
		if (title) {
			console.log(`[calibre-db] EPUB metadata: title="${title}", no author — falling back`);
			return { title, author: parseFilenameAuthor(filename) };
		}
		throw new Error('Missing dc:title in OPF');
	} catch (err) {
		console.warn(`[calibre-db] Could not read EPUB metadata from "${filename}": ${err} — falling back to filename`);
		return parseFilename(filename);
	}
}

/**
 * Parse title and author from a filename as a last resort.
 * Handles common patterns like "Title - Author.epub", "Author - Title.epub", etc.
 */
function parseFilename(filename: string): { title: string; author: string } {
	const stem = path.basename(filename, path.extname(filename));
	// Strip trailing format tags like "(EPUB)", "(Kindle)", etc.
	const cleaned = stem.replace(/\s*\([A-Za-z0-9]+\)\s*$/, '').trim();
	const dashMatch = cleaned.match(/^(.+?)\s+-\s+(.+)$/);
	if (dashMatch) {
		return { title: dashMatch[1].trim(), author: dashMatch[2].trim() };
	}
	return { title: cleaned, author: 'Unknown' };
}

/** Extract just the author from a filename, used when OPF has a title but no author. */
function parseFilenameAuthor(filename: string): string {
	return parseFilename(filename).author;
}

/** "Roald Dahl" → "Dahl, Roald" */
function authorSort(name: string): string {
	const parts = name.trim().split(/\s+/);
	if (parts.length === 1) return name;
	const last = parts[parts.length - 1];
	const rest = parts.slice(0, -1).join(' ');
	return `${last}, ${rest}`;
}

/** "The BFG" → "BFG, The" */
function titleSort(title: string): string {
	const m = title.match(/^(The|A|An)\s+/i);
	if (!m) return title;
	return title.slice(m[0].length) + ', ' + m[1];
}

/**
 * Add a book file to Calibre's library:
 *  1. Parse title/author from filename
 *  2. Insert into metadata.db (books, authors, books_authors_link, data)
 *  3. Create the Author/Title (id)/ directory structure
 *  4. Move the flat file into it with the canonical Calibre filename
 *
 * @param flatFilePath - Absolute path to the already-copied flat file in BOOKS_DIR
 * @returns The new book_id, or null on failure (never throws)
 */
export async function addBookToCalibre(flatFilePath: string): Promise<number | null> {
	try {
		const filename = path.basename(flatFilePath);
		const ext = path.extname(filename).toLowerCase().slice(1); // "epub"
		const { title, author } = ext === 'epub'
			? await readEpubMeta(flatFilePath)
			: parseFilename(filename);

		console.log(`[calibre-db] Adding "${title}" by "${author}" (${ext})`);

		const db = getDb();
		const now = new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '+00:00');
		const uuid = randomUUID();

		// Insert or reuse author
		const existingAuthor = db.prepare('SELECT id FROM authors WHERE name = ?').get(author);
		let authorId: number;
		if (existingAuthor) {
			authorId = existingAuthor.id;
			console.log(`[calibre-db] Reusing author id=${authorId}`);
		} else {
			const r = db.prepare('INSERT INTO authors (name, sort, link) VALUES (?, ?, ?)').run(author, authorSort(author), '');
			authorId = Number(r.lastInsertRowid);
			console.log(`[calibre-db] Inserted author id=${authorId}`);
		}

		// Insert book with empty path first (we need the id to build the path)
		const bookId = Number(
			db.prepare(`
				INSERT INTO books (title, sort, timestamp, pubdate, series_index, author_sort, uuid, path, has_cover, last_modified)
				VALUES (?, ?, ?, ?, 1.0, ?, ?, '', 0, ?)
			`).run(title, titleSort(title), now, now, authorSort(author), uuid, now).lastInsertRowid
		);
		console.log(`[calibre-db] Inserted book id=${bookId}`);

		// Link book ↔ author
		db.prepare('INSERT INTO books_authors_link (book, author) VALUES (?, ?)').run(bookId, authorId);

		// Build Calibre path: "Author Name/Title (book_id)"
		const relPath = `${sanitize(author)}/${sanitize(title)} (${bookId})`;
		const absDir = path.join(env.BOOKS_DIR, relPath);
		await fs.mkdir(absDir, { recursive: true });

		// Canonical Calibre filename: "Title - Author" (no extension)
		const canonicalName = sanitize(`${title} - ${author}`);
		const destFile = path.join(absDir, `${canonicalName}.${ext}`);

		// Move flat file into structured directory
		await fs.rename(flatFilePath, destFile);
		console.log(`[calibre-db] Moved to: ${destFile}`);

		// Update books.path
		db.prepare('UPDATE books SET path = ? WHERE id = ?').run(relPath, bookId);

		// Insert data row
		const stat = await fs.stat(destFile);
		db.prepare('INSERT INTO data (book, format, uncompressed_size, name) VALUES (?, ?, ?, ?)').run(
			bookId,
			ext.toUpperCase(),
			stat.size,
			canonicalName
		);

		console.log(`[calibre-db] Done — book id=${bookId} registered in Calibre library`);
		return bookId;
	} catch (err) {
		console.error(`[calibre-db] Failed to add "${flatFilePath}" to Calibre:`, err);
		return null;
	}
}
