import { logger } from '$lib/server/logger';
import * as v from 'valibot';

export interface CampusIdValidationOptions {
	url: string;
	apiKey: string;
}

export const QRValidationResultSchema = v.object({
	apiVersion: v.string(),
	timestamp: v.pipe(v.number(), v.finite()),
	uid: v.string()
});

export type QRValidationResult = v.InferOutput<typeof QRValidationResultSchema>;

function extractUid(body: string): string | null {
	const trimmed = body.trim();
	if (!trimmed) return null;

	try {
		const parsed: unknown = JSON.parse(trimmed);
		const validationResult = v.parse(QRValidationResultSchema, parsed);
		return validationResult.uid.trim() || null;
	} catch (error) {
		logger.warn({ err: error }, 'Campus ID validation response was invalid');
		return null;
	}
}

export async function validateCampusId(
	qrstring: string,
	validationUrl: string,
	apiKey: string
): Promise<string | null> {
	const scannedValue = qrstring.trim();
	if (!scannedValue) return null;

	const url = new URL(validationUrl.trim());
	url.searchParams.set('qrstring', scannedValue);

	try {
		const response = await fetch(url, {
			method: 'GET',
			headers: {
				'x-api-key': apiKey.trim()
			}
		});

		if (!response.ok) {
			logger.warn(
				{
					status: response.status,
					statusText: response.statusText
				},
				'Campus ID validation request failed'
			);
			return null;
		}

		const body = await response.text();
		const uid = extractUid(body);

		if (!uid) {
			logger.warn('Campus ID validation response did not contain a UID');
		}

		return uid;
	} catch (error) {
		logger.error({ err: error }, 'Campus ID validation request threw');
		return null;
	}
}
