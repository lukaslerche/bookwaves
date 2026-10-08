import { getAllReaders } from '$lib/reader/factory';
import type { ReaderInfo } from '$lib/reader/interface';
import { getConfig } from '$lib/server/config';
import { logger } from '$lib/server/logger';

export async function loadMiddlewareReaders(
	options: { operatingMode?: 'host' | 'notification' } = {}
) {
	const config = getConfig();

	const middlewareReaders = await Promise.all(
		config.middleware_instances.map(async (instance) => {
			try {
				const readers = await getAllReaders(instance);
				return {
					instance,
					readers: options.operatingMode
						? readers.filter((reader) => reader.mode === options.operatingMode)
						: readers
				};
			} catch (error) {
				logger.error({ err: error, instance: instance.id }, 'Error fetching readers');
				return {
					instance,
					readers: [] as ReaderInfo[]
				};
			}
		})
	);

	return { config, middlewareReaders };
}
