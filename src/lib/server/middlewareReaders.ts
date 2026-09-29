import { getAllReaders } from '$lib/reader/factory';
import type { ReaderInfo } from '$lib/reader/interface';
import { getConfig } from '$lib/server/config';
import { logger } from '$lib/server/logger';

type LoadMiddlewareReadersOptions = {
	onlyInNotificationMode?: boolean;
	onlyInHostMode?: boolean;
};

export async function loadMiddlewareReaders(options: LoadMiddlewareReadersOptions = {}) {
	const config = getConfig();

	const middlewareReaders = await Promise.all(
		config.middleware_instances.map(async (instance) => {
			try {
				var readers = await getAllReaders(instance);
                
				if (options.onlyInNotificationMode) {
					readers = readers.filter((reader) => reader.mode === 'notification');
				}

				if (options.onlyInHostMode) {
					readers = readers.filter((reader) => reader.mode === 'host');
				}

				return { instance, readers };
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
