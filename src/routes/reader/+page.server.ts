import { loadMiddlewareReaders } from '$lib/server/middlewareReaders';
import { logger } from '$lib/server/logger';

export async function load() {
	const { middlewareReaders } = await loadMiddlewareReaders({ operatingMode: 'host' });
	logger.info({ middlewareReaderCount: middlewareReaders.length }, 'Loaded reader page data');

	return {
		middlewareReaders
	};
}
