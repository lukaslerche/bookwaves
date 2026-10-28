import type { PageServerLoad } from './$types';
import { getConfig, type LoginMode } from '#lib/server/config.js';
import { logger } from '#lib/server/logger.js';

export const load = (async () => {
	let autoReturnActive = true;
    let hideLocation = false;
	try {
		const config = getConfig();
        autoReturnActive = config.checkout?.auto_return ?? true;
        hideLocation = config.hide_location ?? false;
	} catch (error) {
		logger.error({ err: error }, 'Failed to load return config');
	}
    return {
        autoReturnActive,
        hideLocation
    }
}) satisfies PageServerLoad;
