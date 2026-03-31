import type {
	CheckoutContext,
	LmsFee,
	LmsPickup,
	LmsRequest,
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
	location_code: LocationCodeSchema,
	loan_date: v.optional(v.string()),
	due_date: v.optional(v.string()),
	alternative_call_number: v.optional(v.string()),
	call_number: v.optional(v.string())
});

export const ItemLoanResponseSchema = v.object({
	item_loan: v.optional(v.array(ItemLoanSchema)),
	total_record_count: v.number()
});

const RequestSubTypeSchema = v.object({
	value: v.optional(v.string()),
	desc: v.optional(v.string())
});

const UserRequestSchema = v.object({
	request_id: v.string(),
	title: v.optional(v.string()),
	request_type: v.optional(v.string()),
	request_sub_type: v.optional(RequestSubTypeSchema),
	pickup_location: v.optional(v.string()),
	request_status: v.optional(v.string()),
	place_in_queue: v.optional(v.union([v.number(), v.string()])),
	request_date: v.optional(v.string()),
	expiry_date: v.optional(v.string()),
	manual_description: v.optional(v.string()),
	item_id: v.optional(v.string()),
	author: v.optional(v.string()),
	chapter_title: v.optional(v.string()),
	journal_title: v.optional(v.string()),
	volume: v.optional(v.string()),
	issue: v.optional(v.string()),
	pages: v.optional(v.string()),
	publication_year: v.optional(v.union([v.string(), v.number()])),
	shelf_mark: v.optional(v.string()),
	call_number: v.optional(v.string())
});

const UserRequestsResponseSchema = v.object({
	user_request: v.optional(v.array(UserRequestSchema)),
	total_record_count: v.optional(v.number())
});

const AlmaFeeSchema = v.object({
	type: v.union([v.string(), ValueDescLinkSchema]),
	balance: v.union([v.number(), v.string()]),
	title: v.optional(v.string()),
	author: v.optional(v.string()),
	publication_year: v.optional(v.union([v.string(), v.number()])),
	comment: v.optional(v.string()),
	creation_time: v.optional(v.string()),
	status: v.optional(v.union([v.string(), ValueDescLinkSchema]))
});

const FeesResponseSchema = v.object({
	total_record_count: v.optional(v.number()),
	total_sum: v.optional(v.union([v.number(), v.string()])),
	currency: v.optional(v.union([v.string(), ValueDescLinkSchema])),
	fee: v.optional(v.array(AlmaFeeSchema))
});

function extractValueDesc(input: unknown): { value?: string; desc?: string } {
	if (typeof input === 'string') {
		return { value: input, desc: input };
	}

	if (input && typeof input === 'object') {
		const maybeObj = input as { value?: unknown; desc?: unknown };
		return {
			value: typeof maybeObj.value === 'string' ? maybeObj.value : undefined,
			desc: typeof maybeObj.desc === 'string' ? maybeObj.desc : undefined
		};
	}

	return {};
}

function parseBalance(input: unknown): number {
	if (typeof input === 'number') {
		return Number.isFinite(input) ? input : 0;
	}

	if (typeof input === 'string') {
		const normalized = input.replace(',', '.').replace(/[^0-9.-]/g, '');
		const parsed = Number.parseFloat(normalized);
		return Number.isNaN(parsed) ? 0 : parsed;
	}

	return 0;
}

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
				label: 'Blue shelf',
				color: 'blue',
				message: 'Place this item in the blue sorting shelf',
				sortOrder: 2
			};
		}

		if (location.includes('fiction') || location.includes('fantasy')) {
			return {
				binId: 'red',
				label: 'Red shelf',
				color: 'red',
				message: 'Place this item in the red sorting shelf',
				sortOrder: 1
			};
		}

		return {
			binId: 'yellow',
			label: 'Yellow shelf',
			color: 'yellow',
			message: 'Place this item in the yellow sorting shelf',
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
		let bodyText: string | null;

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
			year: loan.publication_year,
			edition: '',
			place: '',
			date: loan.publication_year,
			publisher: '',
			library: loan.library.desc ?? loan.library.value,
			location: loan.location_code.name ?? loan.location_code.value,
			shelfmark: loan.alternative_call_number ?? loan.call_number ?? '',
			loanDate: loan.loan_date,
			dueDate: loan.due_date,
			returnLibrary: loan.library.desc ?? loan.library.value,
			status: 'On loan',
			cover: `https://picsum.dev/120/180?seed=${encodeURIComponent(loan.title)}`
		};
		mediaItem.returnDirective = this.buildReturnDirective(mediaItem);
		return mediaItem;
	}

	private inferRequestYear(request: v.InferOutput<typeof UserRequestSchema>): string | undefined {
		if (typeof request.publication_year === 'number') {
			return String(request.publication_year);
		}

		if (typeof request.publication_year === 'string' && request.publication_year.trim()) {
			return request.publication_year.trim();
		}

		const fromManualDescription = request.manual_description?.trim();
		if (fromManualDescription && /^\d{4}$/.test(fromManualDescription)) {
			return fromManualDescription;
		}

		return undefined;
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

	private buildFullRequestTitle(request: v.InferOutput<typeof UserRequestSchema>): string {
		const titleParts = [request.title].filter((part): part is string => Boolean(part?.trim()));

		const detailParts = [
			request.chapter_title,
			request.journal_title,
			request.volume,
			request.issue,
			request.pages
		].filter((part): part is string => Boolean(part?.trim()));

		if (detailParts.length > 0) {
			titleParts.push(detailParts.join(' | '));
		}

		if (request.author?.trim()) {
			titleParts.push(request.author.trim());
		}

		return titleParts.join(' - ') || request.request_id;
	}

	private mapRequestToLmsRequest(request: v.InferOutput<typeof UserRequestSchema>): LmsRequest {
		const placeInQueue =
			typeof request.place_in_queue === 'number'
				? request.place_in_queue
				: Number.parseInt(request.place_in_queue ?? '', 10);

		return {
			requestId: request.request_id,
			title: request.title ?? request.request_id,
			fullTitle: this.buildFullRequestTitle(request),
			author: request.author?.trim() || undefined,
			year: this.inferRequestYear(request),
			requestType: request.request_type,
			requestSubType: request.request_sub_type?.desc ?? request.request_sub_type?.value,
			pickupLocation: request.pickup_location ?? request.request_type,
			requestStatus: request.request_status,
			placeInQueue: Number.isNaN(placeInQueue) ? undefined : placeInQueue,
			requestDate: request.request_date,
			expiryDate: request.expiry_date,
			manualDescription: request.manual_description,
			itemId: request.item_id,
			shelfmark: request.shelf_mark ?? request.call_number
		};
	}

	private async fetchUserRequests(): Promise<v.InferOutput<typeof UserRequestSchema>[]> {
		if (!this.currentUserId) {
			return [];
		}

		const params = new URLSearchParams(this.params.toString());
		params.set('limit', '100');

		let res: Response;
		try {
			res = await fetch(
				`${this.apiUrl}users/${encodeURIComponent(this.currentUserId)}/requests?${params.toString()}`
			);
		} catch {
			throw new Error('Network error while fetching user requests');
		}

		if (!res.ok) {
			throw new Error(`Error fetching user requests: ${res.statusText}`);
		}

		const requestsData = await res.json();
		const parsedRequestsData = v.safeParse(UserRequestsResponseSchema, requestsData);

		if (!parsedRequestsData.success) {
			logger.error({ issues: parsedRequestsData.issues }, 'Parsed requests data error');
			throw new Error('Invalid requests data format');
		}

		return parsedRequestsData.output.user_request ?? [];
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
			lang: 'de',
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
			borrowedItems.push(this.mapLoanToMediaItem(loan));
		}
		return borrowedItems;
	}

	async getRequests(): Promise<LmsRequest[]> {
		if (!this.currentUserId) {
			return [];
		}

		const requests = await this.fetchUserRequests();

		return requests
			.filter((request) => request.request_status !== 'ON_HOLD_SHELF')
			.map((request) => this.mapRequestToLmsRequest(request))
			.sort((a, b) => (a.requestDate ?? '').localeCompare(b.requestDate ?? ''));
	}

	async getPickups(): Promise<LmsPickup[]> {
		if (!this.currentUserId) {
			return [];
		}

		const requests = await this.fetchUserRequests();

		return requests
			.filter((request) => request.request_status === 'ON_HOLD_SHELF')
			.map((request) => this.mapRequestToLmsRequest(request))
			.sort((a, b) => (a.expiryDate ?? '').localeCompare(b.expiryDate ?? ''));
	}

	async getFees(): Promise<LmsFee[]> {
		if (!this.currentUserId) {
			return [];
		}

		let res: Response;
		try {
			res = await fetch(
				`${this.apiUrl}users/${encodeURIComponent(this.currentUserId)}/fees?${this.params.toString()}`
			);
		} catch {
			throw new Error('Network error while fetching user fees');
		}

		if (!res.ok) {
			throw new Error(`Error fetching user fees: ${res.statusText}`);
		}

		const feesData: unknown = await res.json();
		const parsedFeesData = v.safeParse(FeesResponseSchema, feesData);

		let feeEntries: unknown[] = [];
		let currency: string | undefined;

		if (parsedFeesData.success) {
			currency = extractValueDesc(parsedFeesData.output.currency).value;
			feeEntries = parsedFeesData.output.fee ?? [];
		} else {
			logger.warn(
				{ issues: parsedFeesData.issues, feesData },
				'Parsed fees data warning; using fallback mapper'
			);
			if (feesData && typeof feesData === 'object') {
				const raw = feesData as { fee?: unknown; currency?: unknown };
				currency = extractValueDesc(raw.currency).value;
				feeEntries = Array.isArray(raw.fee) ? raw.fee : [];
			}
		}

		return feeEntries
			.map((entry): LmsFee => {
				const fee = entry as {
					type?: unknown;
					balance?: unknown;
					status?: unknown;
					title?: unknown;
					author?: unknown;
					publication_year?: unknown;
					comment?: unknown;
					creation_time?: unknown;
				};

				const type = extractValueDesc(fee.type).desc ?? extractValueDesc(fee.type).value ?? 'Fee';
				const status = extractValueDesc(fee.status).desc ?? extractValueDesc(fee.status).value;
				const title = typeof fee.title === 'string' ? fee.title : undefined;
				const author = typeof fee.author === 'string' ? fee.author : undefined;
				const year =
					typeof fee.publication_year === 'number'
						? String(fee.publication_year)
						: typeof fee.publication_year === 'string'
							? fee.publication_year
							: undefined;
				const comment = typeof fee.comment === 'string' ? fee.comment : undefined;
				const creationTime = typeof fee.creation_time === 'string' ? fee.creation_time : undefined;

				return {
					type,
					balance: parseBalance(fee.balance),
					currency,
					status,
					title,
					author,
					year,
					comment,
					creationTime
				};
			})
			.sort((a, b) => (a.creationTime ?? '').localeCompare(b.creationTime ?? ''));
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
