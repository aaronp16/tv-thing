# tv-thing

A SvelteKit web interface for searching TorrentLeech for TV shows and movies, downloading via qBittorrent, and copying completed downloads into the Jellyfin library.

## Quick Reference

Development happens directly on the homelab server, so dev uses the same media and torrent data as production.

```bash
# Development (on the server, reads .env — see .env.example)
npm run dev -- --host # Dev server at http://192.168.1.69:5173
npm run check         # Run svelte-check

# Deploy (no CI — prod image is built locally from this checkout)
cd ~/homelab && docker compose up -d --build tv-thing
```

Production is defined in `~/homelab/docker-compose.yml` (`tv-thing` service, `image: tv-thing:local`, port 13339).

## Project Overview

### Tech Stack
- **Frontend**: SvelteKit 2, Svelte 5 (runes), Tailwind CSS v4
- **Backend**: SvelteKit server routes (Node.js adapter for Docker)
- **Torrent Client**: external qBittorrent (WebUI API)
- **Integrations**: TorrentLeech (search/download), TMDB (metadata, trending, watch providers), Jellyfin (library status)

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `TL_USERNAME` / `TL_PASSWORD` | (required) | TorrentLeech credentials |
| `TL_2FA_TOKEN` | | TorrentLeech 2FA token (optional) |
| `QB_URL` | `http://localhost:8080` | qBittorrent WebUI URL |
| `QB_USERNAME` / `QB_PASSWORD` | `admin` / | qBittorrent WebUI credentials |
| `QB_SAVE_PATH` | | qBittorrent save path override (optional) |
| `MEDIA_DIR` | `/media` | Jellyfin media root (contains `tv/` and `movies/`) |
| `TORRENT_DOWNLOAD_DIR` | `/torrents` | Where qBittorrent's `/data/torrents` is visible to this app |
| `DATA_DIR` | `/config` | Persistent app data (`watchlist.json`) |
| `TMDB_API_KEY` | | TMDB v3 key or v4 read token |
| `TMDB_REGION` | `GB` | Watch provider region |
| `JELLYFIN_URL` / `JELLYFIN_API_KEY` | | Jellyfin server and API key |

### Storage page (`/storage`)
Treemaps of the torrents folder and the library, with delete/cleanup actions (`src/lib/server/storage.ts`).
- **Torrent ↔ library link**: `copyToLibrary()` keeps original filenames, so a library file with the same filename + exact size as a torrent file is its copy. Worked out from disk on each scan; nothing is stored.
- **Hit-and-run status**: scraped from the TL snatchlist (`/profile/{user}/snatchlist`), matched to qBittorrent torrents by exact total size. Safe = seeded ≥ the hours on TL's H&R page (168) or ratio ≥ 1.
- Deletes only touch paths inside `MEDIA_DIR/tv` and `MEDIA_DIR/movies`, and torrents in the `tv`/`movies` categories.

---

## MyAnonamouse API Reference

MAM provides a JSON search API. Auth is cookie-based using `mam_id` and `uid`.

### Search Endpoint
```
GET https://www.myanonamouse.net/tor/js/loadSearchJSONbasic.php
```

**Key parameters:**
- `tor[text]` - search query
- `tor[srchIn][title]`, `tor[srchIn][author]`, etc. - fields to search
- `tor[cat][]` - category filter (e-book IDs: 60-82,90-96,101-104,107,109,112,115,118,120; audiobook IDs: 39-59,83-89,97-100,106,108,111,119)
- `tor[startNumber]` - pagination offset (page size is 20)
- `tor[searchType]` - all, active, fl (freeleech), VIP, etc.

**Response:**
```json
{
  "data": [
    {
      "id": 123456,
      "title": "Harry Potter and the Philosopher's Stone",
      "author_info": "{\"1234\": \"J.K. Rowling\"}",
      "narrator_info": "",
      "series_info": "{\"5678\": {\"series_name\": \"Harry Potter\", \"series_number\": \"1\"}}",
      "catname": "Ebooks - Fantasy",
      "size": "1234567",
      "seeders": 50,
      "leechers": 2,
      "times_completed": 500,
      "filetype": "EPUB",
      "free": 0,
      "vip": 0,
      "lang_code": "en"
    }
  ],
  "total": 100,
  "found": 100,
  "perpage": 20,
  "start": 0
}
```

### Torrent Download
```
GET https://www.myanonamouse.net/tor/download.php?tid={torrent_id}
Cookie: mam_id={MAM_ID}; uid={MAM_UID}
```

Returns the `.torrent` file binary.

---

## Project Structure

```
book-thing/
├── CLAUDE.md                  # This file
├── PLAN.md                    # Full implementation plan
├── docker-compose.yml         # Docker orchestration
├── Dockerfile                 # Container build
├── package.json
├── svelte.config.js
├── vite.config.ts
├── tsconfig.json
├── src/
│   ├── app.html
│   ├── app.d.ts
│   ├── routes/
│   │   ├── +layout.svelte         # Main layout (dark theme)
│   │   ├── +page.svelte           # Main page (search + results + library)
│   │   ├── layout.css             # Tailwind + animations
│   │   └── api/
│   │       ├── search/+server.ts      # Search MAM
│   │       ├── download/+server.ts    # Start torrent download
│   │       ├── progress/[id]/+server.ts  # SSE download progress
│   │       ├── torrents/+server.ts    # List/manage torrents
│   │       ├── library/+server.ts     # Scan book library
│   │       └── stats/+server.ts       # Disk space
│   └── lib/
│       ├── index.ts
│       ├── types.ts               # Shared types
│       ├── components/            # Svelte components
│       ├── stores/                # Svelte stores
│       └── server/
│           ├── env.ts             # Environment config
│           ├── mam-client.ts      # MAM API wrapper
│           ├── torrent-engine.ts  # WebTorrent wrapper
│           ├── downloader.ts      # Download orchestrator
│           └── library.ts         # Scan book directory
└── books/                         # Volume mount point (gitignored)
    └── .torrents/                 # Persisted .torrent files
```

---

## Key Implementation Details

### WebTorrent (In-Process Torrent Client)
```typescript
import WebTorrent from 'webtorrent';
const client = new WebTorrent({ torrentPort: env.TORRENT_PORT });

// Add torrent from buffer
const torrent = client.add(torrentBuffer, { path: env.BOOKS_DIR });

// Progress events
torrent.on('download', () => {
  console.log(torrent.progress);       // 0.0 to 1.0
  console.log(torrent.downloadSpeed);  // bytes/sec
  console.log(torrent.numPeers);       // connected peers
});

// Completed - auto-seeds
torrent.on('done', () => {
  console.log('Seeding:', torrent.uploaded);
});
```

### Torrent Persistence
On add: save `.torrent` buffer to `$BOOKS_DIR/.torrents/{infoHash}.torrent`
On startup: scan `.torrents/` dir and `client.add()` each file for seeding

### MAM Cookie Rotation
MAM may rotate the `mam_id` cookie in responses. The client tracks the latest
value from `Set-Cookie` headers and uses it for subsequent requests.
