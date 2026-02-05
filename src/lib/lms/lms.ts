import * as v from 'valibot';

// This is an interface for a Library Management System (LMS)

export const LmsReturnDirectiveSchema = v.object({
	binId: v.string(),
	label: v.string(),
	color: v.optional(v.string()),
	message: v.optional(v.string()),
	sortOrder: v.optional(v.number())
});

export const MediaItemSchema = v.object({
	barcode: v.string(),
	title: v.optional(v.string()),
	author: v.optional(v.string()),
	edition: v.optional(v.string()),
	place: v.optional(v.string()),
	date: v.optional(v.string()),
	publisher: v.optional(v.string()),
	cover: v.optional(v.string()),
	status: v.optional(v.string()),
	library: v.optional(v.string()),
	location: v.optional(v.string()),
	shelfmark: v.optional(v.string()),
	returnDirective: v.optional(LmsReturnDirectiveSchema)
});

//export type MediaItem = typeof MediaItemSchema;
export type MediaItem = v.InferOutput<typeof MediaItemSchema>;

export type LmsReturnDirective = v.InferOutput<typeof LmsReturnDirectiveSchema>;

export type LmsActionSuccess = {
	ok: true;
	item?: MediaItem;
	message?: string;
	directive?: LmsReturnDirective;
};

export type LmsActionFailure = {
	ok: false;
	reason: string;
	errors?: string[];
	status?: number;
};

export type LmsActionResult = LmsActionSuccess | LmsActionFailure;

export interface CheckoutContext {
	checkoutProfileId?: string;
	library?: string;
	circDesk?: string;
}
/*export interface MediaItem {
	id: string;
	title: string;
	author?: string;
	year?: number;
	cover?: string;
	status: 'available' | 'borrowed' | 'reserved';
	dueDate?: Date;
	borrower?: string;
}*/

export interface LibraryManagementSystem {
	loginUser(user: string, password?: string): Promise<boolean>;
	getAccount(): Promise<{ name: string; fees: number; loans: number }>;
	getLoans(): Promise<MediaItem[]>;
	logoutUser(): Promise<boolean>;

	/**
	 * Standardized result for LMS actions that can succeed or fail.
	 */
	borrowItem(barcode: string, context?: CheckoutContext): Promise<LmsActionResult>;
	returnItem(barcode: string, context?: CheckoutContext): Promise<LmsActionResult>;
	/**
	 * Get media item details by RFID tag ID
	 * @param barcode The RFID tag identifier
	 * @returns MediaItem or null if not found
	 */
	getItem(barcode: string): Promise<MediaItem | null>;
	/**
	 * Get the fees for a user
	 * @param userId The user identifier
	 * @returns The fee amount
	 */
	//getFees(userId?: string): Promise<number>;
	getHealth(): Promise<{ result: boolean; reason?: string }>;
}
