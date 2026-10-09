import { buildGetItemsResponse, buildErrorResponse } from '#lib/lms/alma-xml.js';
import type { AlmaRFIDItem } from '#lib/lms/alma-types.js';
import type { RFIDData } from '#lib/reader/interface.js';
import { resolveReaderByIp } from '#lib/server/resolveReader.js';
import { logger } from '#lib/server/logger.js';
import type { RequestHandler } from './$types';

const corsHeaders = {
	'Access-Control-Allow-Origin': '*',
	'Access-Control-Allow-Methods': 'GET, OPTIONS',
	'Access-Control-Allow-Headers': 'Content-Type'
};

function mapTagToAlmaItem(tag: RFIDData): AlmaRFIDItem & {
	is_complete: boolean;
	total_num_of_parts: number;
} {
	const barcode = String(tag.mediaId ?? tag.id);
	return {
		barcode,
		secure: tag.secured ?? false,
		tags: [
			{
				barcode,
				partNumber: 1,
				materialType: tag.tagType || 'BOOK',
				library: 'LIB1',
				location: 'LOC1'
			}
		],
		is_complete: true,
		total_num_of_parts: 1
	};
}

export const OPTIONS = async () =>
	new Response(null, {
		headers: corsHeaders
	});

export const GET: RequestHandler = async ({ url }) => {
	try {
		const readerIp = url.searchParams.get('reader_ip');
		if (!readerIp) {
			return new Response(buildErrorResponse('Missing reader_ip'), {
				status: 400,
				headers: {
					...corsHeaders,
					'Content-Type': 'application/xml'
				}
			});
		}

		const resolved = await resolveReaderByIp(readerIp);

		if (!resolved) {
			return new Response(buildErrorResponse('Reader not found'), {
				status: 404,
				headers: {
					...corsHeaders,
					'Content-Type': 'application/xml'
				}
			});
		}

		logger.debug({ readerIp }, 'Fetching items from reader');
		const inventory = await resolved.reader.inventory();
		const items = inventory.map(mapTagToAlmaItem);

		logger.debug({ readerIp, itemCount: items.length }, 'Fetched items from reader');

		return new Response(buildGetItemsResponse(items), {
			headers: {
				...corsHeaders,
				'Content-Type': 'application/xml'
			}
		});
	} catch (error) {
		logger.error({ err: error }, 'Error in getItems');
		return new Response(buildErrorResponse('Failed to retrieve items'), {
			status: 500,
			headers: {
				...corsHeaders,
				'Content-Type': 'application/xml'
			}
		});
	}
};
