// These are the remote function calls to interact with the LMS from the client side (browser, +page.svelte)

import { command, getRequestEvent, query } from '$app/server';
import type {
	LibraryManagementSystem,
	LmsActionResult,
	LmsFee,
	LmsPickup,
	LmsRequest
} from './lms';
//import * as serverLms from '$lib/server/lms';
import { getLms } from '../server/lms/resolve';
import * as v from 'valibot';
import { AUTH_COOKIE_NAME, clearAuthCookie, setAuthCookie } from '$lib/server/auth-cookies';
import { logger } from '$lib/server/logger';

const lms: LibraryManagementSystem = getLms();

async function resumeUserFromCookie() {
	const event = getRequestEvent();
	const cookieUser = event?.cookies.get(AUTH_COOKIE_NAME);

	if (cookieUser) {
		await lms.loginUser(cookieUser);
		return cookieUser;
	}

	return null;
}

export const getHealth = query(async () => lms.getHealth());
export const getAccount = query(async () => {
	await resumeUserFromCookie();
	return lms.getAccount();
});
export const getLoans = query(async () => {
	await resumeUserFromCookie();
	return lms.getLoans();
});
export const getRequests = query(async (): Promise<LmsRequest[]> => {
	await resumeUserFromCookie();
	return lms.getRequests();
});
export const getPickups = query(async (): Promise<LmsPickup[]> => {
	await resumeUserFromCookie();
	return lms.getPickups();
});
export const getFees = query(async (): Promise<LmsFee[]> => {
	await resumeUserFromCookie();
	return lms.getFees();
});

export const loginUser = command(
	v.object({
		user: v.string(),
		password: v.optional(v.string())
	}),
	async ({ user, password }) => {
		const ok = await lms.loginUser(user, password);
		const event = getRequestEvent();

		if (event) {
			if (ok) {
				setAuthCookie(event.cookies, user, event.url);
			} else {
				clearAuthCookie(event.cookies, event.url);
			}
		}

		return ok;
	}
);

export const logoutUser = command(async () => {
	const event = getRequestEvent();
	if (event) {
		clearAuthCookie(event.cookies, event.url);
	}
	return lms.logoutUser();
});

export const getItem = query(v.string(), async (barcode) => lms.getItem(barcode));

const CheckoutContextSchema = v.object({
	checkoutProfileId: v.optional(v.string()),
	library: v.optional(v.string()),
	circDesk: v.optional(v.string())
});

const CheckoutCommandSchema = v.object({
	barcode: v.string(),
	context: v.optional(CheckoutContextSchema)
});

export const borrowItem = command(
	CheckoutCommandSchema,
	async ({ barcode, context }): Promise<LmsActionResult> => {
		await resumeUserFromCookie();
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
		await resumeUserFromCookie();
		try {
			return await lms.returnItem(barcode, context);
		} catch (error) {
			logger.error({ err: error, barcode }, 'Return item command failed');
			return { ok: false, reason: 'Unexpected error while returning item' };
		}
	}
);
