# book-thing

A SvelteKit web interface for searching and downloading books from MyAnonamouse with a built-in torrent client.

## Quick Reference

```bash
# Development
npm run dev           # Start dev server (http://localhost:5173)
npm run build         # Build for production
npm run preview       # Preview production build

# Docker
docker compose up -d  # Start with Docker
docker compose down   # Stop

# Type checking
npm run check         # Run svelte-check
```

## Project Overview

**book-thing** is a self-hosted web app that:
- Searches MyAnonamouse's catalog via their JSON API
- Downloads books via a built-in WebTorrent client (no external torrent client needed)
- Seeds completed downloads automatically
- Persists torrent state across restarts
- Shows download progress, speeds, peers, and seeding status

### Tech Stack
- **Frontend**: SvelteKit 2, Svelte 5 (runes), Tailwind CSS v4
- **Backend**: SvelteKit server routes (Node.js adapter for Docker)
- **Torrent Client**: WebTorrent (in-process, headless)
- **Containerization**: Docker + docker-compose with volume mount for `/books`

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `MAM_ID` | (required) | MyAnonamouse session cookie (`mam_id`) |
| `MAM_UID` | (required) | MyAnonamouse user ID |
| `BOOKS_DIR` | `./books` (dev) / `/books` (Docker) | Download directory (volume mount) |
| `TORRENT_PORT` | `6881` | Port for incoming torrent connections |

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
