import { command } from '$app/server';
import * as v from 'valibot';
import { validateCampusId } from '$lib/server/auth/campus_id';
import { getConfig } from '$lib/server/config';
import { logger } from '$lib/server/logger';

export const validateLoginScanRemote = command(v.string(), async (qrstring) => {
	const scannedValue = qrstring.trim();
	if (!scannedValue) return null;

	const config = getConfig();
	const validationConfig = config.login?.validation;

	if (!validationConfig?.implementation) {
		return scannedValue;
	}

	if (validationConfig.implementation === 'campus_id') {
		if (!validationConfig.campus_id?.url || !validationConfig.campus_id?.api_key) {
			logger.warn('Campus ID validation is configured but missing URL or API key');
			return scannedValue;
		}
		const uid = await validateCampusId(
			scannedValue,
			validationConfig.campus_id.url,
			validationConfig.campus_id.api_key
		);

		if (!uid) {
			logger.warn('Login scan validation failed for configured campus_id implementation');
		}

		return uid;
	}

	logger.warn(
		{ implementation: validationConfig.implementation },
		'Unknown login scan validation implementation; falling back to direct scanner login'
	);
	return scannedValue;
});
