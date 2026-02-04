import { loadMiddlewareReaders } from '$lib/server/middlewareReaders';
import type { TaggingConfig } from '$lib/server/config';
import type { TaggingFormats } from '$lib/server/config';

export async function load() {
	const { config, middlewareReaders } = await loadMiddlewareReaders();

    const taggingFormats = (config as { tagging_formats: TaggingFormats[] }).tagging_formats;
	const tagging = (config as { tagging?: TaggingConfig }).tagging;
	const whitelist = (tagging?.whitelist?.values ?? [])
		.filter((value) => typeof value === 'string')
		.map((value) => value.trim())
		.filter((value) => value.length > 0);

	return {
		middlewareReaders,
		whitelist,
        taggingFormats
	};
}
