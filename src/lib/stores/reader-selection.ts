import type { RFIDReader } from '#lib/reader/interface.js';
import { FeigRFIDReader } from '#lib/reader/feig.js';
import { mockRFIDReader } from '#lib/reader/mock.js';
import { clientLogger } from '#lib/client/logger.js';

/**
 * Helper functions to get the currently selected reader from localStorage
 * This allows other parts of the application to access the selected reader
 */

export function getSelectedMiddleware(): string | null {
	if (typeof window === 'undefined') return null;
	return localStorage.getItem('selectedMiddleware');
}

export function getSelectedReader(): string | null {
	if (typeof window === 'undefined') return null;
	return localStorage.getItem('selectedReader');
}

export function setSelectedReaderConfig(middleware: string, reader: string): void {
	if (typeof window === 'undefined') return;
	localStorage.setItem('selectedMiddleware', middleware);
	localStorage.setItem('selectedReader', reader);
}

export function getSelectedFormat(): string | null {
	if (typeof window === 'undefined') return null;
	return localStorage.getItem('selectedFormat');
}

export function setSelectedFormat(format: string): void {
	if (typeof window === 'undefined') return;
	localStorage.setItem('selectedFormat', format);
}

export function getSelectedReaderConfig(): {
	middleware: string;
	reader: string;
} | null {
	const middleware = getSelectedMiddleware();
	const reader = getSelectedReader();

	if (!middleware || !reader) return null;

	return { middleware, reader };
}

/**
 * Create an RFIDReader instance from the stored selection
 * @param middlewareUrl Optional URL override for the middleware (for Feig readers)
 * @param middlewareType The type of middleware (feig, mock, etc.)
 * @returns RFIDReader instance or null if no reader is selected
 */
export function createReaderFromSelection(
	middlewareUrl?: string,
	middlewareType?: string
): RFIDReader | null {
	const config = getSelectedReaderConfig();
	if (!config) return null;

	const type = middlewareType?.toLowerCase() || 'feig';

	switch (type) {
		case 'mock':
			return mockRFIDReader;

		case 'feig':
			return new FeigRFIDReader({
				baseUrl: middlewareUrl,
				readerName: config.reader
			});

		default:
			clientLogger.warn(`Unknown middleware type: ${type}`);
			return null;
	}
}

/**
 * Get reader configuration from URL params with fallback to localStorage
 * Priority: URL params > localStorage > null
 * @param middlewareId Middleware ID from URL params
 * @param readerId Reader ID from URL params
 * @returns Reader configuration or null
 */
export function getReaderConfigWithParams(
	middlewareId?: string | null,
	readerId?: string | null
): { middleware: string; reader: string } | null {
	// Prefer URL params if provided
	if (middlewareId && readerId) {
		return { middleware: middlewareId, reader: readerId };
	}

	// Fallback to localStorage
	return getSelectedReaderConfig();
}

/**
 * Create an RFIDReader instance from URL params or localStorage
 * Priority: URL params > localStorage > null
 * @param middlewareId Middleware ID from URL params
 * @param readerId Reader ID from URL params
 * @param middlewareUrl Middleware URL (for Feig readers)
 * @param middlewareType Middleware type (feig, mock, etc.)
 * @returns RFIDReader instance or null
 */
export function createReaderFromParams(
	middlewareId?: string | null,
	readerId?: string | null,
	middlewareUrl?: string,
	middlewareType?: string
): RFIDReader | null {
	const config = getReaderConfigWithParams(middlewareId, readerId);
	if (!config) {
		clientLogger.warn(
			'No reader configuration found. Please configure via URL params or admin page.'
		);
		return null;
	}

	const type = middlewareType?.toLowerCase() || 'feig';

	clientLogger.info('Creating reader with config:', {
		middleware: config.middleware,
		reader: config.reader,
		type,
		url: middlewareUrl
	});

	switch (type) {
		case 'mock':
			return mockRFIDReader;

		case 'feig':
			if (!middlewareUrl) {
				clientLogger.error('Feig reader requires a middleware URL');
				return null;
			}
			return new FeigRFIDReader({
				baseUrl: middlewareUrl,
				readerName: config.reader
			});

		default:
			clientLogger.warn(`Unknown middleware type: ${type}`);
			return null;
	}
}
