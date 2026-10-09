import {
	buildSuccessResponse,
	buildErrorResponse,
	parseSetSecurityPayload
} from '#lib/lms/alma-xml.js';
import type { RFIDData } from '#lib/reader/interface.js';
import { resolveReaderByIp } from '#lib/server/resolveReader.js';
import { logger } from '#lib/server/logger.js';
import type { RequestHandler } from './$types';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'POST, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

function findTagByBarcode(inventory: RFIDData[], barcode: string): RFIDData | undefined {
	const normalized = barcode.trim();
	return inventory.find(
		(item) => item.id === normalized || (item.mediaId && item.mediaId === normalized)
	);
}

export const OPTIONS = async () =>
	new Response(null, {
		headers: corsHeaders
	});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const xml = await request.text();
		const payload = parseSetSecurityPayload(xml);

		if (!payload.readerIp) {
			return new Response(buildErrorResponse('Missing reader_ip'), {
				status: 400,
				headers: {
					...corsHeaders,
					'Content-Type': 'application/xml'
				}
			});
		}

		if (!payload.barcode) {
			return new Response(buildErrorResponse('Missing barcode'), {
				status: 400,
				headers: {
					...corsHeaders,
					'Content-Type': 'application/xml'
				}
			});
		}

		if (!payload.secureProvided) {
			return new Response(buildErrorResponse('Missing secure flag'), {
				status: 400,
				headers: {
					...corsHeaders,
					'Content-Type': 'application/xml'
				}
			});
		}

		const resolved = await resolveReaderByIp(payload.readerIp);

		if (!resolved) {
			return new Response(buildErrorResponse('Reader not found'), {
				status: 404,
				headers: {
					...corsHeaders,
					'Content-Type': 'application/xml'
				}
			});
		}

		// wait 200ms to ensure reader is ready, since alma calls may be rapid-fire from the getItems call
		await new Promise((resolve) => setTimeout(resolve, 200));
		const inventory = await resolved.reader.inventory();
		logger.debug({ inventory }, 'Inventory retrieved');
		const tag = findTagByBarcode(inventory, payload.barcode);

		if (!tag) {
			logger.debug('Tag not found by inventory call');
			return new Response(buildErrorResponse('Item not found on reader'), {
				status: 404,
				headers: {
					...corsHeaders,
					'Content-Type': 'application/xml'
				}
			});
		}

		// If inventory already reports the desired state, skip the reader call
		if (typeof tag.secured === 'boolean' && tag.secured === payload.secure) {
			logger.debug('Security state already matches, skipping reader call');
			return new Response(buildSuccessResponse(true), {
				status: 200,
				headers: {
					...corsHeaders,
					'Content-Type': 'application/xml'
				}
			});
		}

		// wait 200ms to ensure reader is ready
		await new Promise((resolve) => setTimeout(resolve, 200));

		const result = payload.secure
			? await resolved.reader.secure(tag.id)
			: await resolved.reader.unsecure(tag.id);

		logger.debug({ result }, 'Set security result');

		const success = result.success === true;
		return new Response(buildSuccessResponse(success), {
			status: success ? 200 : 500,
			headers: {
				...corsHeaders,
				'Content-Type': 'application/xml'
			}
		});
	} catch (error) {
		logger.error({ err: error }, 'Error in setSecurity');
		return new Response(buildErrorResponse('Failed to set security'), {
			status: 500,
			headers: {
				...corsHeaders,
				'Content-Type': 'application/xml'
			}
		});
	}
};
