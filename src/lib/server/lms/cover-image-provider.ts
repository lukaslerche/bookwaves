import { logger } from '$lib/server/logger';

export type CoverImageProvider = {
	url: string;
};

export function buildProviderCoverUrl(
	coverImageProvider: CoverImageProvider | undefined,
	isbns: string[] | undefined
): string | undefined {
	if (!coverImageProvider || !isbns?.length) return undefined;

	const url = new URL(coverImageProvider.url);
	url.searchParams.set('isbn', isbns.join(','));
	logger.debug({ url: url.toString(), isbns }, 'Prepared cover image provider URL');
	return url.toString();
}
