/**
 * Environment configuration with defaults
 *
 * Uses SvelteKit's $env/dynamic/private for .env loading in dev,
 * and falls back to process.env for production (adapter-node / Docker).
 */

import { env as svelteEnv } from '$env/dynamic/private';

export const env = {
	/** TorrentLeech username */
	TL_USERNAME: svelteEnv.TL_USERNAME || '',
	/** TorrentLeech password */
	TL_PASSWORD: svelteEnv.TL_PASSWORD || '',
	/** TorrentLeech 2FA token (optional, for accounts with Alt 2FA enabled) */
	TL_2FA_TOKEN: svelteEnv.TL_2FA_TOKEN || '',
	/** qBittorrent WebUI URL */
	QB_URL: svelteEnv.QB_URL || 'http://localhost:8080',
	/** qBittorrent WebUI username */
	QB_USERNAME: svelteEnv.QB_USERNAME || 'admin',
	/** qBittorrent WebUI password */
	QB_PASSWORD: svelteEnv.QB_PASSWORD || '',
	/** Save path in qBittorrent (if different from default) */
	QB_SAVE_PATH: svelteEnv.QB_SAVE_PATH || '',
	/** Base Jellyfin/media directory (contains tv/ and movies/ subdirs) */
	MEDIA_DIR: svelteEnv.MEDIA_DIR || '/media',
	/** Where qBittorrent stores completed downloads (for copy-from path mapping) */
	TORRENT_DOWNLOAD_DIR: svelteEnv.TORRENT_DOWNLOAD_DIR || '/torrents',
	/** TMDB API key (v3) or Read Access Token (v4 Bearer) */
	TMDB_API_KEY: svelteEnv.TMDB_API_KEY || '',
	/** ISO country code for watch provider region */
	TMDB_REGION: svelteEnv.TMDB_REGION || 'GB',
	/** Jellyfin server URL e.g. http://192.168.1.69:8096 */
	JELLYFIN_URL: svelteEnv.JELLYFIN_URL || '',
	/** Jellyfin API key (Dashboard → API Keys) */
	JELLYFIN_API_KEY: svelteEnv.JELLYFIN_API_KEY || ''
};
