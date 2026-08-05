import type { PageServerLoad } from './$types';
import { getLms } from '$lib/server/lms/resolve';
import { clearAuthCookie, getAuthUserFromCookies } from '$lib/server/auth-cookies';
import { getConfig, type LoginMode } from '$lib/server/config';
import { logger } from '$lib/server/logger';
import type { LoginHelpImageConfig } from '$lib/types/login';

export const load = (async ({ cookies }) => {
	const lms = getLms();
	const userId = getAuthUserFromCookies(cookies);
	let loginMode: LoginMode = 'username_password';
	let loginHelpImage: LoginHelpImageConfig | undefined;
	let scannerFocusAssist = false;
	let topAlignedModal = false;

	try {
		const config = getConfig();
		loginMode = config.login?.mode ?? 'username_password';
		loginHelpImage = config.login?.login_help_image;
		scannerFocusAssist = config.login?.scanner_focus_assist ?? false;
		topAlignedModal = config.login?.top_aligned_modal ?? false;
	} catch (error) {
		logger.error({ err: error }, 'Failed to load login config; defaulting to username/password');
	}

	if (!userId) {
		logger.info('No auth cookie found for checkout/borrow load');
		await lms.logoutUser();
		return { account: null, authUser: null, requiresAuth: true, loginMode, loginHelpImage, scannerFocusAssist, topAlignedModal };
	}

	const loggedIn = await lms.resumeUserSession(userId);

	if (!loggedIn) {
		logger.warn({ userId }, 'Stored auth cookie failed to login in checkout/borrow');
		clearAuthCookie(cookies);
		await lms.logoutUser();
		return { account: null, authUser: null, requiresAuth: true, loginMode, loginHelpImage, scannerFocusAssist, topAlignedModal };
	}

	try {
		const account = await lms.getAccount();
		logger.info({ userId }, 'Loaded checkout/borrow account data');
		return { account, authUser: userId, requiresAuth: false, loginMode, loginHelpImage, scannerFocusAssist, topAlignedModal  };
	} catch (error) {
		logger.error({ err: error }, 'Failed to load account data');
		clearAuthCookie(cookies);
		await lms.logoutUser();
		return { account: null, authUser: null, requiresAuth: true, loginMode, loginHelpImage, scannerFocusAssist, topAlignedModal };
	}
}) satisfies PageServerLoad;
