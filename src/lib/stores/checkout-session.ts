import { browser } from '$app/environment';
import type { RFIDData } from '$lib/reader/interface';
import type { LmsReturnDirective, MediaItem } from '$lib/lms/lms';

export type SessionItemType = 'borrow' | 'return';

export type SessionItem = {
	rfidData: RFIDData;
	mediaItem: MediaItem | null;
	directive?: LmsReturnDirective | null;
	timestamp: number;
	status: 'success' | 'failed' | 'unavailable' | 'not-borrowed';
	message: string;
	rfidWarning?: string;
};

export type CheckoutSession = {
	type: SessionItemType;
	items: SessionItem[];
	startedAt: number;
};

/**
 * Normalize an RFID item into a stable identity that does not change when
 * the tag's secured state flips. Prefer mediaId when available because it
 * stays constant even if the EPC representation changes.
 */
export function getItemIdentity(item: RFIDData): string {
	return item.mediaId ?? item.id;
}

const STORAGE_KEY = 'checkout-session';

export function getCheckoutSession(): CheckoutSession | null {
	if (!browser) return null;

	const stored = localStorage.getItem(STORAGE_KEY);
	if (!stored) return null;

	try {
		return JSON.parse(stored);
	} catch {
		return null;
	}
}

export function startCheckoutSession(type: SessionItemType): CheckoutSession {
	const session: CheckoutSession = {
		type,
		items: [],
		startedAt: Date.now()
	};

	if (browser) {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
	}

	return session;
}

export function addSessionItem(item: SessionItem): CheckoutSession | null {
	if (!browser) return null;

	const session = getCheckoutSession();
	if (!session) return null;

	const identity = getItemIdentity(item.rfidData);

	// Check if item already exists (by stable identity)
	const existingIndex = session.items.findIndex((i) => getItemIdentity(i.rfidData) === identity);

	if (existingIndex >= 0) {
		// Update existing item
		session.items[existingIndex] = item;
	} else {
		// Add new item
		session.items.push(item);
	}

	localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
	return session;
}

export function clearCheckoutSession(): void {
	if (!browser) return;
	localStorage.removeItem(STORAGE_KEY);
}

export function getSuccessfulItems(session: CheckoutSession | null): SessionItem[] {
	if (!session) return [];
	return session.items.filter((item) => item.status === 'success');
}

export function isItemInSession(rfidId: string): boolean {
	const session = getCheckoutSession();
	if (!session) return false;

	return session.items.some((item) => getItemIdentity(item.rfidData) === rfidId);
}
