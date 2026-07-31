import { getConfig } from '$lib/server/config';
import type { LibraryManagementSystem } from '../../lms/lms';
import { mockLMS } from './mock';
import { AlmaLMS } from './alma';

let cached: LibraryManagementSystem | null = null;

export function getLms(): LibraryManagementSystem {
	if (cached) return cached;

	const { lms: lmsConfig, login, checkout } = getConfig();

	if (lmsConfig.type === 'alma') {
		if (!lmsConfig.api_key) {
			throw new Error('Missing Alma API key in configuration (lms.api_key)');
		}
		cached = new AlmaLMS({
			apiKey: lmsConfig.api_key,
			pinLogin: login?.mode === 'username_password_or_pin',
			checkoutProfiles: checkout?.profiles
		});
		return cached;
	}

	cached = mockLMS;
	return cached;
}
