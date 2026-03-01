# book-thing - Implementation Plan

A self-hosted web app for searching and downloading books from MyAnonamouse (MAM) private tracker, with a built-in torrent client. Mirrors the architecture of [music-thing](../music-thing).

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    SvelteKit App (Node.js)                   │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Frontend     │  │  API Routes  │  │  Server Modules  │  │
│  │  (Svelte 5)  │◄─┤  /api/*      │◄─┤                  │  │
│  │              │  │              │  │  mam-client.ts   │  │
│  │  Search UI   │  │  /search     │  │  torrent-engine  │  │
│  │  Downloads   │  │  /download   │  │  downloader.ts   │  │
│  │  Library     │  │  /progress   │  │  library.ts      │  │
│  │  Torrents    │  │  /torrents   │  │                  │  │
│  └──────────────┘  └──────────────┘  └────────┬─────────┘  │
│                                                │             │
│                                       ┌────────▼─────────┐  │
│                                       │  WebTorrent      │  │
│                                       │  (in-process)    │  │
│                                       │  - Downloads     │  │
│                                       │  - Seeds         │  │
│                                       │  - Persists      │  │
│                                       └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
         │                                       │
         ▼                                       ▼
  ┌──────────────┐                      ┌──────────────┐
  │  MAM API     │                      │  /books/     │
  │  (search +   │                      │  (volume)    │
  │  .torrent)   │                      │              │
  └──────────────┘                      └──────────────┘
```

### Key Design Decisions

1. **Built-in torrent client** - WebTorrent runs headlessly inside the same Node.js process. No separate container, no external torrent client needed.
2. **MAM API directly** - No Prowlarr/Jackett middleman. We hit MAM's JSON search API with cookie auth.
3. **Keep files as-is** - Torrent contents are saved exactly as the torrent structures them (needed for seeding integrity).
4. **Persist torrent state** - `.torrent` files saved to `$BOOKS_DIR/.torrents/` and re-added on startup for continued seeding.
5. **Same stack as music-thing** - SvelteKit 2, Svelte 5 (runes), Tailwind v4, adapter-node, Docker.

---

## Phase 1: Project Scaffold ✅

Create the project with the same tooling as music-thing:

- **Framework**: SvelteKit 2 + Svelte 5 + TypeScript
- **Styling**: Tailwind CSS v4
- **Build**: Vite 7, adapter-node
- **Linting**: ESLint 9 + Prettier
- **Docker**: Multi-stage Dockerfile, compose with volume mount + torrent port
- **CI/CD**: GitHub Actions for multi-arch Docker image builds

**Files created:**
- `package.json` - dependencies (webtorrent instead of ffmpeg-static/music-metadata)
- `svelte.config.js`, `vite.config.ts`, `tsconfig.json` - build config
- `eslint.config.js`, `.prettierrc`, `.prettierignore`, `.npmrc` - linting
- `.gitignore`, `.env.example`, `.vscode/settings.json` - project config
- `src/app.html`, `src/app.d.ts` - SvelteKit app shell
- `src/routes/layout.css`, `+layout.svelte`, `+page.svelte` - minimal UI
- `src/lib/server/env.ts` - environment config (MAM_ID, MAM_UID, BOOKS_DIR, TORRENT_PORT)
- `src/lib/types.ts` - shared TypeScript types
- `Dockerfile`, `docker-compose.yml`, `docker-compose.example.yml` - Docker setup
- `.github/workflows/docker.yml` - CI/CD
- `PLAN.md`, `CLAUDE.md` - documentation

**Deliverable:** `npm run dev` boots successfully, shows placeholder dark page.

---

## Phase 2: MAM Client ✅

Integrate with MyAnonamouse's search API.

**MAM API details:**
- Endpoint: `https://www.myanonamouse.net/tor/js/loadSearchJSONbasic.php`
- Auth: Cookie-based (`mam_id={MAM_ID}; uid={MAM_UID}`)
- Returns: JSON with `{ data: Entry[], total, found, perpage, start }`
- Each entry includes: title, author_info (JSON), narrator_info (JSON), series_info (JSON), catname, seeders, leechers, size, filetype, free/vip status
- Torrent download: `https://www.myanonamouse.net/tor/download.php?tid={id}`
- Categories: `EB_*` = e-books, `AB_*` = audiobooks (filterable by category ID)
- Rate limit: ~1 request/second recommended

**Files to create:**
- `src/lib/server/mam-client.ts` - MAM API wrapper
  - `searchBooks(query, type, page)` - search with category filtering
  - `downloadTorrent(id)` - fetch .torrent file buffer
  - Parse `author_info`, `narrator_info`, `series_info` JSON strings
  - Handle MAM's cookie rotation (mam_id can change per response)
- `src/routes/api/search/+server.ts` - search API route

**Deliverable:** `GET /api/search?q=harry+potter&type=ebooks` returns structured book metadata.

---

## Phase 3: Torrent Engine

WebTorrent wrapper that runs for the lifetime of the process.

**Files to create:**
- `src/lib/server/torrent-engine.ts` - singleton WebTorrent client
  - Initialize on first import (module-level singleton)
  - `addTorrent(torrentBuffer, savePath, mamId?)` - start download
  - `getTorrents()` - list all active/seeding torrents with stats
  - `getTorrent(infoHash)` - get single torrent details
  - `removeTorrent(infoHash, deleteFiles?)` - stop and optionally remove files
  - On startup: scan `$BOOKS_DIR/.torrents/` and re-add for seeding
  - Save `.torrent` files to `$BOOKS_DIR/.torrents/{infoHash}.torrent` on add
  - Configurable incoming port via `TORRENT_PORT` env var

**Deliverable:** Can programmatically add a .torrent and watch it download + seed.

---

## Phase 4: Download System + API Routes

Full API layer connecting frontend to MAM + torrent engine.

**Files to create:**
- `src/lib/server/downloader.ts` - download orchestrator
  - Fetch .torrent from MAM -> save to .torrents dir -> add to WebTorrent
  - Track active download jobs
  - Stream progress via SSE
- `src/routes/api/download/+server.ts` - POST start download
- `src/routes/api/progress/[id]/+server.ts` - GET SSE progress stream
- `src/routes/api/torrents/+server.ts` - GET list all torrents, DELETE remove
- `src/routes/api/torrents/[hash]/+server.ts` - GET/DELETE single torrent
- `src/routes/api/library/+server.ts` - GET scan book library, DELETE remove book
- `src/routes/api/stats/+server.ts` - GET disk space info

**Deliverable:** Full API layer working end-to-end.

---

## Phase 5: Frontend

Full UI mirroring music-thing's patterns.

**Components to create:**
- Search page
  - Search bar with query input
  - Filter pills: E-Books / Audiobooks / All
  - Results grid with book cards (title, author, category, size, seeders/leechers, freeleech badge)
  - Download button on each result
- Downloads panel
  - Active torrent downloads with progress bars
  - Download speed, upload speed, peer count
  - Seeding indicator for completed torrents
- Library sidebar
  - Author/Title tree view of downloaded books
  - File type and size info
  - Delete operations
- Torrents management
  - View all seeding torrents
  - Stop seeding individual torrents
  - Ratio and upload stats
- Toast notifications
- Mobile responsive with tab bar (Search / Library / Downloads)

**Stores:**
- `downloads.ts` - active download jobs + SSE subscription
- `libraryIndex.ts` - lightweight "in library" checking
- `toasts.ts` - notification queue

**Deliverable:** Fully functional UI.

---

## Phase 6: Docker + CI/CD

Finalize production deployment.

- Test full Docker workflow end-to-end
- Verify torrent port mapping works for peer connections
- Verify seeding persistence across container restarts
- GitHub Actions builds multi-arch images to GHCR

**Deliverable:** `docker compose up` runs the complete app.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MAM_ID` | (required) | MyAnonamouse session cookie |
| `MAM_UID` | (required) | MyAnonamouse user ID |
| `BOOKS_DIR` | `./books` (dev) / `/books` (Docker) | Book download directory |
| `TORRENT_PORT` | `6881` | Port for incoming torrent connections |

---

## File Organization

```
$BOOKS_DIR/
  .torrents/              # Saved .torrent files for seeding persistence
    {infoHash}.torrent
  {torrent folder name}/  # Kept exactly as torrent structures it
    book-file.epub
    book-file.pdf
    cover.jpg
    ...
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | SvelteKit 2 |
| UI | Svelte 5 (runes syntax) |
| Language | TypeScript (strict) |
| CSS | Tailwind CSS v4 |
| Bundler | Vite 7 |
| Node Adapter | @sveltejs/adapter-node |
| Torrent Client | WebTorrent (npm, in-process) |
| Tracker API | MyAnonamouse JSON API (cookie auth) |
| Container | Docker (node:22-alpine) |
| CI/CD | GitHub Actions (multi-arch) |
