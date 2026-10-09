// These are the remote function calls to interact with the LMS from the client side (browser, +page.svelte)

import { command, getRequestEvent, query } from '$app/server';
import type {
	LibraryManagementSystem,
	LmsActionResult,
	LmsFee,
	LmsPickup,
	LmsRequest
} from './lms';
//import * as serverLms from '#lib/server/lms';
import { getLms } from '../server/lms/resolve';
import * as v from 'valibot';
import { AUTH_COOKIE_NAME, clearAuthCookie, setAuthCookie } from '#lib/server/auth-cookies.js';
import { logger } from '#lib/server/logger.js';

const lms: LibraryManagementSystem = getLms();

// Queries can neither write cookies nor read `event.url`, so only commands
// clear a stale auth cookie.
async function resumeUserFromCookie({ clearStaleCookie }: { clearStaleCookie: boolean }) {
	const event = getRequestEvent();
	const cookieUser = event?.cookies.get(AUTH_COOKIE_NAME);

	if (cookieUser) {
		const ok = await lms.resumeUserSession(cookieUser);
		if (ok) return cookieUser;

		if (event && clearStaleCookie) {
			clearAuthCookie(event.cookies, event.url);
		}
		await lms.logoutUser();
	}

	return null;
}

export const getHealth = query(async () => lms.getHealth());
export const getAccount = query(async () => {
	await resumeUserFromCookie({ clearStaleCookie: false });
	return lms.getAccount();
});
export const getLoans = query(async () => {
	await resumeUserFromCookie({ clearStaleCookie: false });
	return lms.getLoans();
});
export const getRequests = query(async (): Promise<LmsRequest[]> => {
	await resumeUserFromCookie({ clearStaleCookie: false });
	return lms.getRequests();
});
export const getPickups = query(async (): Promise<LmsPickup[]> => {
	await resumeUserFromCookie({ clearStaleCookie: false });
	return lms.getPickups();
});
export const getFees = query(async (): Promise<LmsFee[]> => {
	await resumeUserFromCookie({ clearStaleCookie: false });
	return lms.getFees();
});

export const loginUser = command(
	v.object({
		user: v.string(),
		loginSecret: v.optional(v.string())
	}),
	async ({ user, loginSecret }) => {
		const normalizedUser = user.trim();
		const ok = await lms.loginUser(normalizedUser, loginSecret);
		const event = getRequestEvent();

		if (event) {
			if (ok) {
				setAuthCookie(event.cookies, normalizedUser, event.url);
			} else {
				clearAuthCookie(event.cookies, event.url);
			}
		}

		return ok;
	}
);

export const resumeCurrentUserSession = command(async () =>
	Boolean(await resumeUserFromCookie({ clearStaleCookie: true }))
);

export const logoutUser = command(async () => {
	const event = getRequestEvent();
	if (event) {
		clearAuthCookie(event.cookies, event.url);
	}
	return lms.logoutUser();
});

const CheckoutContextSchema = v.object({
	checkoutProfileId: v.optional(v.string()),
	library: v.optional(v.string()),
	circDesk: v.optional(v.string())
});

const CheckoutCommandSchema = v.object({
	barcode: v.string(),
	context: v.optional(CheckoutContextSchema)
});

// The checkout context is optional: lookups outside a checkout terminal (the
// gate and reader pages) simply get no return directive.
export const getItem = query(CheckoutCommandSchema, async ({ barcode, context }) =>
	lms.getItem(barcode, context)
);

export const borrowItem = command(
	CheckoutCommandSchema,
	async ({ barcode, context }): Promise<LmsActionResult> => {
		await resumeUserFromCookie({ clearStaleCookie: true });
		try {
			return await lms.borrowItem(barcode, context);
		} catch (error) {
			logger.error({ err: error, barcode }, 'Borrow item command failed');
			return { ok: false, reason: 'Unexpected error while borrowing item' };
		}
	}
);

export const returnItem = command(
	CheckoutCommandSchema,
	async ({ barcode, context }): Promise<LmsActionResult> => {
		await resumeUserFromCookie({ clearStaleCookie: true });
		try {
			return await lms.returnItem(barcode, context);
		} catch (error) {
			logger.error({ err: error, barcode }, 'Return item command failed');
			return { ok: false, reason: 'Unexpected error while returning item' };
		}
	}
);
