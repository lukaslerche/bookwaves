import type {
	CheckoutContext,
	LibraryManagementSystem,
	LmsActionResult,
	LmsReturnDirective,
	MediaItem
} from '../../lms/lms';
import * as v from 'valibot';
import { logger } from '$lib/server/logger';

const DEFAULT_API_URL = 'https://api-eu.hosted.exlibrisgroup.com/almaws/v1/';

type CheckoutProfile = {
	id: string;
	library: string;
	circulation_desk: string;
	type?: string;
};

interface AlmaLmsOptions {
	apiKey: string;
	apiUrl?: string;
	checkoutProfiles?: CheckoutProfile[];
}

const ValueLinkSchema = v.object({
	value: v.number(),
	link: v.string()
});

export const UserSchema = v.object({
	full_name: v.string(),
	fees: v.optional(ValueLinkSchema),
	loans: v.optional(ValueLinkSchema)
});

export const ItemSchema = v.object({
	bib_data: v.object({
		title: v.string(),
		author: v.string(),
		complete_edition: v.string(),
		isbn: v.string(),
		place_of_publication: v.string(),
		date_of_publication: v.string(),
		publisher_const: v.string(),
		mms_id: v.string()
	}),
	holding_data: v.object({
		holding_id: v.string()
	}),
	item_data: v.object({
		pid: v.string(),
		library: v.object({
			value: v.string(),
			desc: v.string()
		}),
		location: v.object({
			value: v.string(),
			desc: v.string()
		}),
		base_status: v.object({
			value: v.string(),
			desc: v.string()
		}),
		process_type: v.optional(
			v.object({
				value: v.optional(v.string()),
				desc: v.optional(v.string())
			})
		),
		alternative_call_number: v.string()
	})
});

const ValueDescLinkSchema = v.object({
	value: v.string(),
	desc: v.optional(v.string()),
	link: v.optional(v.string())
});

const LibrarySchema = v.object({
	value: v.string(),
	desc: v.optional(v.string())
});

const LocationCodeSchema = v.object({
	value: v.string(),
	name: v.optional(v.string())
});

const ItemLoanSchema = v.object({
	circ_desk: ValueDescLinkSchema,
	library: LibrarySchema,
	item_barcode: v.string(),
	mms_id: v.string(),
	holding_id: v.string(),
	item_id: v.string(),
	title: v.string(),
	author: v.string(),
	publication_year: v.string(),
	location_code: LocationCodeSchema
	//due_date: v.pipe(v.string(), v.isoDateTime()) // TODO parse date strings properly
});

export const ItemLoanResponseSchema = v.object({
	item_loan: v.optional(v.array(ItemLoanSchema)),
	total_record_count: v.number()
});

export class AlmaLMS implements LibraryManagementSystem {
	private apiUrl: string;
	private currentUserId?: string;
	private apiKey: string;

	private params: URLSearchParams;
	private itemCache = new Map<string, { mmsId: string; holdingId: string; itemId: string }>();
	private checkoutProfiles = new Map<string, CheckoutProfile>();

	// TODO this is still mocked
	private buildReturnDirective(item: MediaItem): LmsReturnDirective | undefined {
		const location = item.location?.toLowerCase() ?? '';
		const library = item.library?.toLowerCase() ?? '';

		if (location.includes('children') || library.includes('children')) {
			return {
				binId: 'blue',
				label: 'Blue bin',
				color: 'blue',
				message: 'Place this item in the blue sorting bin',
				sortOrder: 2
			};
		}

		if (location.includes('fiction') || location.includes('fantasy')) {
			return {
				binId: 'red',
				label: 'Red bin',
				color: 'red',
				message: 'Place this item in the red sorting bin',
				sortOrder: 1
			};
		}

		return {
			binId: 'green',
			label: 'Green bin',
			color: 'green',
			message: 'Place this item in the green sorting bin',
			sortOrder: 3
		};
	}

	private getCachedItem(barcode: string) {
		const cached = this.itemCache.get(barcode);
		if (cached) {
			this.itemCache.delete(barcode);
			this.itemCache.set(barcode, cached);
		}
		return cached;
	}

	private setCachedItem(
		barcode: string,
		ids: { mmsId: string; holdingId: string; itemId: string }
	): void {
		if (this.itemCache.has(barcode)) this.itemCache.delete(barcode);
		this.itemCache.set(barcode, ids);
		if (this.itemCache.size > 50) {
			const oldestKey = this.itemCache.keys().next().value;
			if (oldestKey !== undefined) this.itemCache.delete(oldestKey);
		}
	}

	private resolveCheckoutDetails(
		context?: CheckoutContext
	): { library: string; circDesk: string } | LmsActionResult {
		const libraryFromContext = context?.library?.trim();
		const circDeskFromContext = context?.circDesk?.trim();

		if (libraryFromContext && circDeskFromContext) {
			return { library: libraryFromContext, circDesk: circDeskFromContext };
		}

		const profileId = context?.checkoutProfileId?.trim();
		if (profileId) {
			const profile = this.checkoutProfiles.get(profileId);
			if (!profile) {
				return { ok: false, reason: `Checkout profile "${profileId}" not found in config` };
			}
			return { library: profile.library, circDesk: profile.circulation_desk };
		}

		if (this.checkoutProfiles.size === 1) {
			const onlyProfile = Array.from(this.checkoutProfiles.values())[0];
			return { library: onlyProfile.library, circDesk: onlyProfile.circulation_desk };
		}

		if (this.checkoutProfiles.size === 0) {
			return {
				ok: false,
				reason: 'No checkout profile configured; provide library and circ_desk values'
			};
		}

		return {
			ok: false,
			reason:
				'Multiple checkout profiles configured; specify checkout_profile_id or provide library and circ_desk'
		};
	}

	private async parseErrorResponse(res: Response): Promise<{ reason: string; errors?: string[] }> {
		const fallbackReason = `Request failed with status ${res.status}`;
		let bodyText: string | null = null;

		try {
			bodyText = await res.text();
			logger.debug({ bodyText }, 'Alma error response body');
		} catch (error) {
			logger.warn({ err: error }, 'Failed to read Alma error response body');
			return { reason: fallbackReason };
		}

		const errors = new Set<string>();
		const addError = (value?: unknown) => {
			if (typeof value === 'string') {
				const trimmedValue = value.trim();
				if (trimmedValue) errors.add(trimmedValue);
			}
		};

		if (bodyText) {
			const trimmed = bodyText.trim();
			const contentType = res.headers.get('content-type') ?? '';
			const looksLikeJson =
				contentType.includes('json') || trimmed.startsWith('{') || trimmed.startsWith('[');

			if (looksLikeJson) {
				try {
					const parsed = JSON.parse(trimmed);
					const errorList = parsed?.errorList?.error;
					const errorsArray = Array.isArray(errorList) ? errorList : errorList ? [errorList] : [];
					for (const err of errorsArray) {
						addError(err?.errorMessage);
					}
					addError(parsed?.errorMessage);
				} catch (error) {
					logger.warn({ err: error, bodyText: trimmed }, 'Failed to parse Alma error JSON');
				}
			} else {
				const xmlMatches = [...trimmed.matchAll(/<errorMessage>([^<]+)<\/errorMessage>/gi)];
				for (const match of xmlMatches) {
					addError(match[1]);
				}
			}

			if (errors.size === 0) {
				addError(trimmed);
			}
		}

		const errorList = Array.from(errors);
		return {
			reason: errorList.length ? errorList.join('; ') : fallbackReason,
			errors: errorList.length ? errorList : undefined
		};
	}

	private mapLoanToMediaItem(loan: v.InferOutput<typeof ItemLoanSchema>): MediaItem {
		const mediaItem: MediaItem = {
			barcode: loan.item_barcode,
			title: loan.title,
			author: loan.author,
			edition: '',
			place: '',
			date: loan.publication_year,
			publisher: '',
			library: loan.library.desc ?? loan.library.value,
			location: loan.location_code.name ?? loan.location_code.value,
			shelfmark: '',
			status: 'On loan',
			cover: `https://picsum.dev/120/180?seed=${encodeURIComponent(loan.title)}`
		};
		mediaItem.returnDirective = this.buildReturnDirective(mediaItem);
		return mediaItem;
	}

	private mapItemToMediaItem(
		itemData: v.InferOutput<typeof ItemSchema>,
		barcode: string
	): MediaItem {
		const mediaItem: MediaItem = {
			barcode,
			title: itemData.bib_data.title,
			author: itemData.bib_data.author,
			edition: itemData.bib_data.complete_edition,
			place: itemData.bib_data.place_of_publication,
			date: itemData.bib_data.date_of_publication,
			publisher: itemData.bib_data.publisher_const,
			library: itemData.item_data.library.desc,
			location: itemData.item_data.location.desc,
			shelfmark: itemData.item_data.alternative_call_number,
			status:
				itemData.item_data.base_status.desc + ': ' + (itemData.item_data.process_type?.desc ?? '-'),
			cover: 'https://picsum.dev/120/180?seed=' + itemData.bib_data.isbn
		};
		mediaItem.returnDirective = this.buildReturnDirective(mediaItem);
		return mediaItem;
	}

	constructor({ apiKey, apiUrl = DEFAULT_API_URL, checkoutProfiles = [] }: AlmaLmsOptions) {
		if (!apiKey) {
			throw new Error('Alma API key is required');
		}

		this.apiUrl = apiUrl;
		this.apiKey = apiKey;
		this.checkoutProfiles = new Map(
			checkoutProfiles
				.filter((profile) => (profile.type ?? 'alma').toLowerCase() === 'alma')
				.map((profile) => [
					profile.id.trim(),
					{
						...profile,
						id: profile.id.trim(),
						library: profile.library.trim(),
						circulation_desk: profile.circulation_desk.trim()
					}
				])
		);

		this.params = new URLSearchParams({
			apikey: this.apiKey,
			lang: 'en',
			format: 'json'
		});

		//this.currentUserId= "25519017"; // Mock user ID for testing
	}

	// Check all critical Alma API endpoints for availability
	public async getHealth(): Promise<{ result: boolean; reason?: string }> {
		const endpoints = [
			{ name: 'users', url: `${this.apiUrl}users/operation/test` },
			{ name: 'bibs', url: `${this.apiUrl}bibs/test` }
		];
		try {
			const responses = await Promise.all(
				endpoints.map((e) =>
					fetch(e.url + '?' + this.params.toString()).catch(
						(err) => ({ error: err, name: e.name }) as const
					)
				)
			);

			for (let i = 0; i < responses.length; i++) {
				const res = responses[i];
				const endpointName = endpoints[i].name;
				if ('error' in res) {
					return { result: false, reason: `${endpointName} endpoint error` };
				}
				if (res.status !== 200) {
					return { result: false, reason: `${endpointName} endpoint returned ${res.status}` };
				}
			}
			return { result: true };
		} catch {
			return { result: false, reason: 'unexpected error during health check' };
		}
	}

	// get the Alma account of a user
	async getAccount(): Promise<{ name: string; fees: number; loans: number }> {
		if (this.currentUserId) {
			let res: Response;
			const expandedParams = new URLSearchParams(this.params.toString());
			expandedParams.append('expand', 'loans,fees');
			try {
				res = await fetch(
					`${this.apiUrl}users/${encodeURIComponent(this.currentUserId)}?` +
						expandedParams.toString()
				);
			} catch {
				throw new Error('Network error while fetching user account');
			}

			if (!res.ok) {
				throw new Error('Error fetching user account: ' + res.statusText);
			}

			const userData = await res.json();
			const parsedUserData = v.safeParse(UserSchema, userData);

			if (!parsedUserData.success) {
				throw new Error('Invalid user data format');
			}

			return {
				name: parsedUserData.output.full_name,
				fees: parsedUserData.output.fees ? parsedUserData.output.fees.value : 0,
				loans: parsedUserData.output.loans ? parsedUserData.output.loans.value : 0
			};
		}

		throw new Error('No user is currently logged in');
	}

	async getLoans(): Promise<MediaItem[]> {
		if (!this.currentUserId) {
			return [];
		}
		logger.debug({ user: this.currentUserId }, 'AlmaLMS.getLoans called');
		const borrowedItems: MediaItem[] = [];
		let res: Response;
		const expandedParams = new URLSearchParams(this.params.toString());
		expandedParams.append('limit', '100');
		expandedParams.append('offset', '0');
		try {
			res = await fetch(
				`${this.apiUrl}users/${encodeURIComponent(this.currentUserId)}/loans?` +
					expandedParams.toString()
			);
		} catch {
			throw new Error('Network error while fetching user loans');
		}

		if (!res.ok) {
			throw new Error('Error fetching user loans: ' + res.statusText);
		}

		const loansData = await res.json();
		logger.trace({ loansData }, 'Raw loans response');
		const parsedLoansData = v.safeParse(ItemLoanResponseSchema, loansData);
		if (!parsedLoansData.success) {
			logger.error({ issues: parsedLoansData.issues }, 'Parsed loans data error');
			throw new Error('Invalid loans data format');
		}
		for (const loan of parsedLoansData.output.item_loan ?? []) {
			borrowedItems.push({
				// TODO there are missing fields
				barcode: loan.item_barcode,
				title: loan.title,
				author: loan.author,
				edition: '',
				place: '',
				date: loan.publication_year,
				publisher: '',
				library: loan.library.desc ?? loan.library.value,
				location: loan.location_code.name ?? loan.location_code.value,
				shelfmark: '',
				status: 'On loan',
				cover: `https://picsum.dev/120/180?seed=${encodeURIComponent(loan.title)}`
			});
		}
		return borrowedItems;
	}

	async loginUser(user: string, password?: string): Promise<boolean> {
		const trimmedUser = user?.trim();

		if (!trimmedUser) {
			this.currentUserId = undefined;
			return false;
		}

		// If the same user is already active and no password check is requested, skip revalidation
		if (this.currentUserId === trimmedUser && !password) {
			return true;
		}

		// TODO: Alma API key auth does not support password verification; keep the parameter for future SSO
		let res: Response;
		const loginParams = new URLSearchParams(this.params.toString());
		loginParams.set('user_id_type', 'all_unique');

		try {
			res = await fetch(
				`${this.apiUrl}users/${encodeURIComponent(trimmedUser)}?${loginParams.toString()}`
			);
		} catch {
			this.currentUserId = undefined;
			throw new Error('Network error while verifying user');
		}

		if (!res.ok) {
			this.currentUserId = undefined;
			return false;
		}

		const userData = await res.json();
		const parsedUserData = v.safeParse(UserSchema, userData);

		if (!parsedUserData.success) {
			this.currentUserId = undefined;
			return false;
		}

		this.currentUserId = trimmedUser;
		return true;
	}

	async logoutUser(): Promise<boolean> {
		this.currentUserId = undefined;
		return true;
	}

	async getItem(barcode: string): Promise<MediaItem | null> {
		// Always fetch fresh data (do not return cached value here)
		let res: Response;
		try {
			res = await fetch(
				`${this.apiUrl}items?item_barcode=${encodeURIComponent(barcode)}&` + this.params.toString()
			);
		} catch {
			throw new Error('Network error while fetching item');
		}
		//console.log('AlmaLMS.item() called with barcode:', barcode);

		if (!res.ok) {
			logger.error({ barcode, status: res.status }, 'Failed to fetch item from Alma');
			throw new Error('Error fetching item: ' + res.statusText);
		}

		const itemData = await res.json();
		logger.trace({ itemData }, 'Raw item response');
		const parsedItemData = v.safeParse(ItemSchema, itemData);
		if (!parsedItemData.success) {
			throw new Error('Invalid item data format');
		}
		const result: MediaItem = {
			barcode: barcode,
			title: parsedItemData.output.bib_data.title,
			author: parsedItemData.output.bib_data.author,
			edition: parsedItemData.output.bib_data.complete_edition,
			place: parsedItemData.output.bib_data.place_of_publication,
			date: parsedItemData.output.bib_data.date_of_publication,
			publisher: parsedItemData.output.bib_data.publisher_const,
			library: parsedItemData.output.item_data.library.desc,
			location: parsedItemData.output.item_data.location.desc,
			shelfmark: parsedItemData.output.item_data.alternative_call_number,
			status:
				parsedItemData.output.item_data.base_status.desc +
				': ' +
				(parsedItemData.output.item_data.process_type?.desc ?? '-'),
			cover: 'https://picsum.dev/120/180?seed=' + parsedItemData.output.bib_data.isbn
		};
		result.returnDirective = this.buildReturnDirective(result);
		this.setCachedItem(barcode, {
			mmsId: parsedItemData.output.bib_data.mms_id,
			holdingId: parsedItemData.output.holding_data.holding_id,
			itemId: parsedItemData.output.item_data.pid
		});
		return result;
	}

	async borrowItem(barcode: string, context?: CheckoutContext): Promise<LmsActionResult> {
		logger.debug({ barcode }, 'AlmaLMS.borrowItem called');

		if (!this.currentUserId) {
			return { ok: false, reason: 'No user is currently logged in' };
		}

		const checkout = this.resolveCheckoutDetails(context);
		if (!('library' in checkout)) {
			return checkout;
		}

		const loanPayload = {
			library: { value: checkout.library },
			circ_desk: { value: checkout.circDesk }
			//request_id: undefined // optional; include a value when a specific request ID is available
		};
		let res: Response;
		try {
			logger.debug({ user: this.currentUserId, barcode }, 'Sending borrow request');
			res = await fetch(
				`${this.apiUrl}users/${encodeURIComponent(this.currentUserId)}/loans?item_barcode=${encodeURIComponent(barcode)}&` +
					this.params.toString(),
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(loanPayload)
				}
			);
			logger.info(
				{ status: res.status, barcode, user: this.currentUserId },
				'Borrow request response'
			);
		} catch (error) {
			logger.error({ err: error }, 'Network error while borrowing item');
			return { ok: false, reason: 'Network error while borrowing item' };
		}

		if (!res.ok) {
			const parsedError = await this.parseErrorResponse(res);
			logger.error(
				{ barcode, status: res.status, reason: parsedError.reason },
				'Failed to borrow item from Alma'
			);
			return {
				ok: false,
				reason: parsedError.reason,
				errors: parsedError.errors,
				status: res.status
			};
		}

		let parsedBody: unknown;
		try {
			const rawText = await res.text();
			parsedBody = JSON.parse(rawText);
		} catch (error) {
			logger.error({ err: error }, 'Failed to parse Alma borrow response');
			return { ok: false, reason: 'Unexpected response format from Alma' };
		}

		logger.trace({ itemData: parsedBody }, 'Raw borrow item response');
		const parsedLoanData = v.safeParse(ItemLoanSchema, parsedBody);
		if (!parsedLoanData.success) {
			logger.error({ issues: parsedLoanData.issues }, 'Parsed loan data error');
			return { ok: false, reason: 'Invalid loan data format' };
		}

		const mediaItem = this.mapLoanToMediaItem(parsedLoanData.output);
		return { ok: true, item: mediaItem, message: 'Successfully borrowed' };
	}

	async returnItem(barcode: string, context?: CheckoutContext): Promise<LmsActionResult> {
		const checkout = this.resolveCheckoutDetails(context);
		if (!('library' in checkout)) {
			return checkout;
		}

		let ids = this.getCachedItem(barcode);
		if (!ids) {
			try {
				await this.getItem(barcode); // refresh caches
			} catch (error) {
				logger.warn({ err: error, barcode }, 'Failed to refresh cached item before return');
			}
			ids = this.getCachedItem(barcode);
		}
		if (!ids) {
			return { ok: false, reason: 'Item not found for the given barcode' };
		}
		const { mmsId, holdingId, itemId } = ids;

		let res: Response;
		try {
			res = await fetch(
				`${this.apiUrl}bibs/${encodeURIComponent(mmsId)}` +
					`/holdings/${encodeURIComponent(holdingId)}` +
					`/items/${encodeURIComponent(itemId)}?` +
					`op=scan&library=${encodeURIComponent(checkout.library)}&circ_desk=${encodeURIComponent(checkout.circDesk)}&` +
					this.params.toString(),
				{ method: 'POST' }
			);
		} catch (error) {
			logger.error({ err: error }, 'Network error while returning item');
			return { ok: false, reason: 'Network error while returning item' };
		}

		if (!res.ok) {
			const parsedError = await this.parseErrorResponse(res);
			logger.error(
				{ barcode, status: res.status, reason: parsedError.reason },
				'Failed to return item from Alma'
			);
			return {
				ok: false,
				reason: parsedError.reason,
				errors: parsedError.errors,
				status: res.status
			};
		}

		let parsedBody: unknown;
		try {
			const rawText = await res.text();
			parsedBody = JSON.parse(rawText);
		} catch (error) {
			logger.error({ err: error }, 'Failed to parse Alma return response');
			return { ok: false, reason: 'Unexpected response format from Alma' };
		}

		logger.trace({ itemData: parsedBody }, 'Raw return item response');
		const parsedItemData = v.safeParse(ItemSchema, parsedBody);

		if (!parsedItemData.success) {
			logger.error({ issues: parsedItemData.issues }, 'Parsed return item data error');
			return { ok: false, reason: 'Invalid item data format after return' };
		}

		const mediaItem = this.mapItemToMediaItem(parsedItemData.output, barcode);
		this.setCachedItem(barcode, {
			mmsId: parsedItemData.output.bib_data.mms_id,
			holdingId: parsedItemData.output.holding_data.holding_id,
			itemId: parsedItemData.output.item_data.pid
		});

		return {
			ok: true,
			item: mediaItem,
			message: 'Successfully returned',
			directive: this.buildReturnDirective(mediaItem)
		};
	}

	// TODO this one is unimplemented in the mock LMS
	/*async getFees(userId?: string): Promise<number> {
		const id = userId ?? this.currentUserId;
		if (!id) return 0;
		try {
			await fetch(`${this.baseTarget}/almaws/v1/users/${encodeURIComponent(id)}/fees`);
		} catch {
			// Swallow errors and fall back to mock response
		}
		return 0; // Mock response until real Fees mapping is implemented
	}*/
}
