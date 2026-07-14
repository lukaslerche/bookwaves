import { getConfig } from '$lib/server/config';
import type { LibraryManagementSystem } from '../../lms/lms';
import { mockLMS } from './mock';
import { AlmaLMS } from './alma';

let cached: LibraryManagementSystem | null = null;

export function getLms(): LibraryManagementSystem {
	if (cached) return cached;

	// const { lms: lmsConfig, checkout } = getConfig();
    const config = getConfig();

	if (config.lms.type === 'alma') {
		if (!config.lms.api_key) {
			throw new Error('Missing Alma API key in configuration (lms.api_key)');
		}
		cached = new AlmaLMS({
			apiKey: config.lms.api_key,
			checkoutProfiles: config.checkout?.profiles
		});
		return cached;
	}

	cached = mockLMS;
	return cached;
}
