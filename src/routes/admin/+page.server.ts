import type { PageServerLoad } from './$types';
import { loadMiddlewareReaders } from '$lib/server/middlewareReaders';

export const load = (async () => {
	const { config, middlewareReaders } = await loadMiddlewareReaders();

	return {
		lmsType: config.lms.type,
		loginMode: config.login?.mode,
		lmsApiKeyMasked: config.lms.api_key.substring(0, 10) + '***',
		middlewareReaders,
		checkoutProfiles: config.checkout?.profiles ?? []
	};
}) satisfies PageServerLoad;
