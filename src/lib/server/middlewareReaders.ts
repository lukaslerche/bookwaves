import { getAllReaders } from '#lib/reader/factory.js';
import type { ReaderInfo } from '#lib/reader/interface.js';
import { getConfig, type MiddlewareInstanceConfig } from '#lib/server/config.js';
import { logger } from '#lib/server/logger.js';

// The result is page data, so only the fields the browser needs leave the server.
function toBrowserInstance({ id, type, url }: MiddlewareInstanceConfig) {
	return { id, type, url };
}

export async function loadMiddlewareReaders(
	options: { operatingMode?: 'host' | 'notification' } = {}
) {
	const config = getConfig();

	const middlewareReaders = await Promise.all(
		config.middleware_instances.map(async (instance) => {
			try {
				const readers = await getAllReaders(instance);
				return {
					instance: toBrowserInstance(instance),
					readers: options.operatingMode
						? readers.filter((reader) => reader.mode === options.operatingMode)
						: readers
				};
			} catch (error) {
				logger.error({ err: error, instance: instance.id }, 'Error fetching readers');
				return {
					instance: toBrowserInstance(instance),
					readers: [] as ReaderInfo[]
				};
			}
		})
	);

	return { config, middlewareReaders };
}
