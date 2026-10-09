import { loadMiddlewareReaders } from '#lib/server/middlewareReaders.js';
import { logger } from '#lib/server/logger.js';

export async function load() {
	const { middlewareReaders } = await loadMiddlewareReaders({ operatingMode: 'host' });
	logger.info({ middlewareReaderCount: middlewareReaders.length }, 'Loaded reader page data');

	return {
		middlewareReaders
	};
}
