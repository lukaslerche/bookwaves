import { getAllReaders, getServerMiddlewareUrl } from '#lib/reader/factory.js';
import type { RFIDReader, ReaderInfo } from '#lib/reader/interface.js';
import { FeigRFIDReader } from '#lib/reader/feig.js';
import { mockRFIDReader } from '#lib/reader/mock.js';
import type { MiddlewareInstanceConfig } from '#lib/server/config.js';
import { getConfig } from '#lib/server/config.js';
import { logger } from '#lib/server/logger.js';

export interface ResolvedReader {
	reader: RFIDReader;
	readerInfo: ReaderInfo;
	middleware: MiddlewareInstanceConfig;
}

function normalizeAddress(value?: unknown): string {
	if (typeof value !== 'string') return '';
	const trimmed = value.trim();
	if (!trimmed) return '';

	try {
		// Allow matching values like http://1.2.3.4:7070
		if (trimmed.startsWith('http')) {
			const url = new URL(trimmed);
			return url.hostname;
		}
	} catch (error) {
		logger.debug({ err: error, value }, 'Failed to normalize reader address');
	}

	const [host] = trimmed.split(':');
	return host || trimmed;
}

function createReaderInstance(
	instance: MiddlewareInstanceConfig,
	info: ReaderInfo
): RFIDReader | null {
	switch (instance.type.toLowerCase()) {
		case 'mock':
			return mockRFIDReader;
		case 'feig':
			try {
				return new FeigRFIDReader({
					baseUrl: getServerMiddlewareUrl(instance),
					readerName: info.name
				});
			} catch (error) {
				logger.error(
					{ err: error, instance: instance.id },
					'Invalid middleware URL for Feig reader'
				);
				return null;
			}
		default:
			logger.warn({ type: instance.type }, 'Unsupported middleware type');
			return null;
	}
}

export async function resolveReaderByIp(readerIp: string): Promise<ResolvedReader | null> {
	const target = normalizeAddress(readerIp);
	if (!target) {
		return null;
	}

	const config = getConfig();

	for (const instance of config.middleware_instances) {
		let readers: ReaderInfo[];

		try {
			readers = await getAllReaders(instance);
		} catch (error) {
			logger.error({ err: error, instance: instance.id }, 'Failed to load readers for middleware');
			continue;
		}

		const match = readers.find((reader) => normalizeAddress(reader.address) === target);
		if (!match) continue;

		const reader = createReaderInstance(instance, match);
		if (!reader) {
			logger.error(
				{ instance: instance.id, reader: match.name },
				'Unable to create reader instance'
			);
			continue;
		}

		return {
			reader,
			readerInfo: match,
			middleware: instance
		};
	}

	return null;
}
