import type { PageServerLoad } from './$types';
import { getLms } from '$lib/server/lms/resolve';
import { clearAuthCookie, getAuthUserFromCookies } from '$lib/server/auth-cookies';
import { getConfig, type LoginMode } from '$lib/server/config';
import { logger } from '$lib/server/logger';

export const load = (async ({ cookies }) => {
	const lms = getLms();
	const userId = getAuthUserFromCookies(cookies);
	let loginMode: LoginMode = 'username_password';

	try {
		loginMode = getConfig().login?.mode ?? 'username_password';
	} catch (error) {
		logger.error({ err: error }, 'Failed to load login config; defaulting to username/password');
	}

	if (!userId) {
		logger.info('No auth cookie found for checkout/account load');
		await lms.logoutUser();
		return {
			account: null,
			loans: [],
			requests: [],
			pickups: [],
			fees: [],
			authUser: null,
			requiresAuth: true,
			loginMode
		};
	}

	const loggedIn = await lms.loginUser(userId);

	if (!loggedIn) {
		logger.warn({ userId }, 'Stored auth cookie failed to login in checkout/account');
		clearAuthCookie(cookies);
		await lms.logoutUser();
		return {
			account: null,
			loans: [],
			requests: [],
			pickups: [],
			fees: [],
			authUser: null,
			requiresAuth: true,
			loginMode
		};
	}

	try {
		const account = await lms.getAccount();
		const loans = await lms.getLoans();
		const requests = await lms.getRequests();
		const pickups = await lms.getPickups();
		const fees = await lms.getFees();
		logger.info(
			{
				userId,
				loanCount: loans.length,
				requestCount: requests.length,
				pickupCount: pickups.length,
				feeCount: fees.length
			},
			'Loaded checkout/account data'
		);
		return {
			account,
			loans,
			requests,
			pickups,
			fees,
			authUser: userId,
			requiresAuth: false,
			loginMode
		};
	} catch (error) {
		logger.error({ err: error }, 'Failed to load account data');
		clearAuthCookie(cookies);
		await lms.logoutUser();
		return {
			account: null,
			loans: [],
			requests: [],
			pickups: [],
			fees: [],
			authUser: null,
			requiresAuth: true,
			loginMode
		};
	}
}) satisfies PageServerLoad;
