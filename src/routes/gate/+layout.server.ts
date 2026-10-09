import type { LayoutServerLoad } from './$types';
import { getConfig } from '#lib/server/config.js';
import { logger } from '#lib/server/logger.js';

export const load: LayoutServerLoad = async ({ url }) => {
	// Extract query parameters
	const middlewareId = url.searchParams.get('middleware_id');
	const readerId = url.searchParams.get('reader_id');

	// Get config to find middleware details
	let middlewareUrl: string | undefined;
	let middlewareType: string | undefined;
	let showAllDetectedItems = true;

	try {
		const config = getConfig();
		showAllDetectedItems = config.gate?.show_all_detected_items ?? true;
		if (middlewareId) {
			const middleware = config.middleware_instances.find((m) => m.id === middlewareId);
			if (middleware) {
				middlewareUrl = middleware.url;
				middlewareType = middleware.type;
				logger.info({ middlewareId }, 'Resolved middleware for gate layout');
			} else {
				logger.warn({ middlewareId }, 'No middleware found for gate layout');
			}
		}
		logger.debug({ showAllDetectedItems }, 'Loaded gate layout configuration');
	} catch (error) {
		logger.error({ err: error }, 'Failed to load config for gate layout');
	}

	return {
		readerConfig: {
			middlewareId: middlewareId || null,
			readerId: readerId || null,
			middlewareUrl,
			middlewareType
		},
		gateConfig: {
			showAllDetectedItems
		}
	};
};
