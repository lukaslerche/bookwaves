import {
	buildSuccessResponse,
	buildErrorResponse,
	parseItemUpdatePayload
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
		const { items, readerIp } = parseItemUpdatePayload(xml);
		logger.info({ readerIp, itemCount: items.length }, 'Received Alma itemUpdate request');

		if (!readerIp) {
			logger.warn('Missing reader_ip in itemUpdate payload');
			return new Response(buildErrorResponse('Missing reader_ip'), {
				status: 400,
				headers: {
					...corsHeaders,
					'Content-Type': 'application/xml'
				}
			});
		}

		if (items.length !== 1) {
			return new Response(buildErrorResponse('Only one item can be updated at a time'), {
				status: 400,
				headers: {
					...corsHeaders,
					'Content-Type': 'application/xml'
				}
			});
		}

		const item = items[0];
		if (!item.barcode) {
			logger.warn({ readerIp }, 'Missing barcode in itemUpdate request');
			return new Response(buildErrorResponse('Missing barcode'), {
				status: 400,
				headers: {
					...corsHeaders,
					'Content-Type': 'application/xml'
				}
			});
		}

		const resolved = await resolveReaderByIp(readerIp);
		if (!resolved) {
			logger.warn({ readerIp }, 'Reader not found for itemUpdate');
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
		logger.debug({ readerIp }, 'Retrieving inventory for item update');
		const inventory = await resolved.reader.inventory();
		logger.debug({ inventory }, 'Inventory retrieved');
		const tag = findTagByBarcode(inventory, item.barcode);

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

		const desiredMediaId = item.barcode.trim();
		const mediaMatches = tag.mediaId?.trim() === desiredMediaId;
		const secureMatches =
			item.secureProvided && typeof tag.secured === 'boolean' && tag.secured === item.secure;
		logger.info(
			{
				readerIp,
				middlewareId: resolved.middleware.id,
				readerName: resolved.readerInfo.name,
				desiredMediaId,
				mediaMatches,
				secureMatches
			},
			'Processing item update on reader'
		);

		// Short-circuit if nothing needs to change
		if (mediaMatches && (!item.secureProvided || secureMatches)) {
			logger.debug('Media ID and security already match, skipping reader calls');
			return new Response(buildSuccessResponse(true), {
				status: 200,
				headers: {
					...corsHeaders,
					'Content-Type': 'application/xml'
				}
			});
		}

		let success = true;
		let targetEpc = tag.id;

		if (!mediaMatches) {
			// wait 200ms to ensure reader is ready
			await new Promise((resolve) => setTimeout(resolve, 200));
			const editResult = await resolved.reader.edit(tag.id, desiredMediaId);
			success = editResult.success === true;
			targetEpc = editResult.newEpc || tag.id;
			logger.info({ editResult, targetEpc }, 'Applied media ID update on reader');
		}

		if (success && item.secureProvided && !secureMatches) {
			// wait 200ms to ensure reader is ready for the security change
			await new Promise((resolve) => setTimeout(resolve, 200));
			logger.debug('Setting security state as part of item update');
			const secureResult = item.secure
				? await resolved.reader.secure(targetEpc)
				: await resolved.reader.unsecure(targetEpc);
			success = secureResult.success === true;
			logger.info({ secureResult, targetEpc }, 'Applied security update on reader');
		}

		logger.info({ readerIp, success, targetEpc }, 'Finished item update request');
		return new Response(buildSuccessResponse(success), {
			status: success ? 200 : 500,
			headers: {
				...corsHeaders,
				'Content-Type': 'application/xml'
			}
		});
	} catch (error) {
		logger.error({ err: error }, 'Error in itemUpdate');
		return new Response(buildErrorResponse('Failed to update item'), {
			status: 500,
			headers: {
				...corsHeaders,
				'Content-Type': 'application/xml'
			}
		});
	}
};
