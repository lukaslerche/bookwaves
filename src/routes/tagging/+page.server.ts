import { loadMiddlewareReaders } from '#lib/server/middlewareReaders.js';
import type { TaggingConfig } from '#lib/server/config.js';

export async function load() {
	const { config, middlewareReaders } = await loadMiddlewareReaders({ operatingMode: 'host' });

	const tagging = (config as { tagging?: TaggingConfig }).tagging;
	const taggingFormats = tagging?.formats ?? [];
	const focus = tagging?.focus;
	const whitelist = (tagging?.whitelist?.values ?? [])
		.filter((value) => typeof value === 'string')
		.map((value) => value.trim())
		.filter((value) => value.length > 0);

	return {
		middlewareReaders,
		whitelist,
		focus,
		taggingFormats
	};
}
