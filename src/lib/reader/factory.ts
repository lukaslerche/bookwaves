import type { MiddlewareInstanceConfig } from '#lib/server/config.js';
import type { ReaderInfo } from './interface';
import { FeigRFIDReader } from './feig';
import { MockRFIDReader } from './mock';
import { logger } from '#lib/server/logger.js';

/**
 * The address the server uses to reach a middleware instance: its internal URL if set,
 * otherwise its URL, which then has to be absolute.
 */
export function getServerMiddlewareUrl(config: MiddlewareInstanceConfig): string {
	const field = config.internal_url ? 'internal_url' : 'url';
	const url = config.internal_url || config.url;
	if (!url) {
		throw new Error(`URL is required for middleware: ${config.id}`);
	}
	if (!/^https?:\/\//i.test(url)) {
		throw new Error(
			field === 'url'
				? `Middleware instance "${config.id}" has a relative url "${url}"; set internal_url so the server can reach it.`
				: `Middleware instance "${config.id}" has a relative internal_url "${url}"; it must be absolute.`
		);
	}
	return url;
}

/**
 * Get all available readers from a middleware instance
 * @param config Middleware instance configuration
 * @returns Promise of reader information array
 */
export async function getAllReaders(config: MiddlewareInstanceConfig): Promise<ReaderInfo[]> {
	try {
		switch (config.type.toLowerCase()) {
			case 'mock':
				return await MockRFIDReader.getAllReaders();

			case 'feig':
				return await FeigRFIDReader.getAllReaders(getServerMiddlewareUrl(config));

			default:
				logger.warn({ type: config.type }, 'Unknown middleware type while fetching readers');
				return [];
		}
	} catch (error) {
		logger.error({ err: error, id: config.id }, 'Failed to get readers from middleware');
		return [];
	}
}

/**
 * Get all readers from multiple middleware instances
 * Returns a map of middleware ID to readers
 */
export async function getAllReadersFromMiddlewares(
	middlewares: MiddlewareInstanceConfig[]
): Promise<Map<string, ReaderInfo[]>> {
	const results = new Map<string, ReaderInfo[]>();

	// Fetch all readers in parallel
	const promises = middlewares.map(async (middleware) => {
		const readers = await getAllReaders(middleware);
		return { middleware, readers };
	});

	const settled = await Promise.allSettled(promises);

	settled.forEach((result) => {
		if (result.status === 'fulfilled') {
			results.set(result.value.middleware.id, result.value.readers);
		}
	});

	return results;
}
