import { dev } from '$app/env';
import type { Cookies } from '@sveltejs/kit';

export const AUTH_COOKIE_NAME = 'bw_auth_user';
const AUTH_COOKIE_MAX_AGE = 60 * 5; // 5 minutes

function cookieOptions(url?: URL) {
	const secure = url ? url.protocol === 'https:' : !dev;
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure,
		maxAge: AUTH_COOKIE_MAX_AGE
	};
}

export function setAuthCookie(cookies: Cookies, user: string, url?: URL) {
	cookies.set(AUTH_COOKIE_NAME, user, cookieOptions(url));
}

export function clearAuthCookie(cookies: Cookies, url?: URL) {
	const { path, sameSite, secure } = cookieOptions(url);
	cookies.delete(AUTH_COOKIE_NAME, { path, sameSite, secure });
}

export function getAuthUserFromCookies(cookies: Cookies): string | null {
	return cookies.get(AUTH_COOKIE_NAME) ?? null;
}
