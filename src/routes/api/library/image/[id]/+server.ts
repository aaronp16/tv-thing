import type { RequestHandler } from './$types';
import { proxyPosterImage } from '$lib/server/jellyfin-client';

export const GET: RequestHandler = async ({ params }) => {
	return proxyPosterImage(params.id);
};
