import type { LayoutServerLoad } from './$types';
import { getConfig } from '$lib/server/config';
import { logger } from '$lib/server/logger';

export const load: LayoutServerLoad = async ({ url }) => {
	// Extract query parameters
	const middlewareId = url.searchParams.get('middleware_id');
	const readerId = url.searchParams.get('reader_id');
	const checkoutProfileId = url.searchParams.get('checkout_profile_id');

	// Get config to find middleware details
	let middlewareUrl: string | undefined;
	let middlewareType: string | undefined;
	let checkoutProfile: {
		id: string;
		library: string;
		circulation_desk: string;
		type?: string;
	} | null = null;
	let lmsType: string | undefined;
	let noMediaFoundImageUrl: string | null = null;

	try {
		const config = getConfig();
		lmsType = config.lms.type;
		noMediaFoundImageUrl = config.checkout?.no_media_found_image ?? null;

		if (middlewareId) {
			const middleware = config.middleware_instances.find((m) => m.id === middlewareId);
			if (middleware) {
				middlewareUrl = middleware.url;
				middlewareType = middleware.type;
				logger.info({ middlewareId }, 'Resolved middleware for checkout layout');
			} else {
				logger.warn({ middlewareId }, 'No middleware found for checkout layout');
			}
		}

		if (checkoutProfileId) {
			checkoutProfile =
				(config.checkout?.profiles ?? []).find((profile) => profile.id === checkoutProfileId) ??
				null;
			if (checkoutProfile) {
				logger.info({ checkoutProfileId }, 'Resolved checkout profile for checkout layout');
			} else {
				logger.warn({ checkoutProfileId }, 'No checkout profile found for checkout layout');
			}
		}
	} catch (error) {
		logger.error({ err: error }, 'Failed to load config for checkout layout');
	}

	return {
		readerConfig: {
			middlewareId: middlewareId || null,
			readerId: readerId || null,
			middlewareUrl,
			middlewareType
		},
		checkoutConfig: {
			noMediaFoundImageUrl
		},
		checkoutProfileId: checkoutProfileId || null,
		checkoutProfile,
		lmsType: lmsType ?? null
	};
};
