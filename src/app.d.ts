// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}

	namespace NodeJS {
		interface ProcessEnv {
			TL_USERNAME?: string;
			TL_PASSWORD?: string;
			TL_2FA_TOKEN?: string;
			QB_URL?: string;
			QB_USERNAME?: string;
			QB_PASSWORD?: string;
			QB_SAVE_PATH?: string;
			MEDIA_DIR?: string;
			TORRENT_DOWNLOAD_DIR?: string;
		}
	}
}

export {};
