import { browser } from '$app/env';
import { parseLogLevel, shouldLog, type LogLevel } from '#lib/logger/levels.js';

const defaultLevel: LogLevel = browser ? 'warn' : 'silent';

function resolveLevel(): LogLevel {
	if (!browser) return defaultLevel;

	const fromStorage =
		typeof localStorage !== 'undefined'
			? localStorage.getItem('LOG_LEVEL') || undefined
			: undefined;
	const fromEnv = (import.meta.env.PUBLIC_LOG_LEVEL || import.meta.env.VITE_LOG_LEVEL || '') as
		string | undefined;
	return parseLogLevel(fromStorage || fromEnv, defaultLevel);
}

const currentLevel = resolveLevel();

const clientLogger = {
	silent: () => undefined,
	fatal: (...args: unknown[]) => shouldLog('fatal', currentLevel) && console.error(...args),
	error: (...args: unknown[]) => shouldLog('error', currentLevel) && console.error(...args),
	warn: (...args: unknown[]) => shouldLog('warn', currentLevel) && console.warn(...args),
	info: (...args: unknown[]) => shouldLog('info', currentLevel) && console.info(...args),
	debug: (...args: unknown[]) => shouldLog('debug', currentLevel) && console.debug(...args),
	trace: (...args: unknown[]) => shouldLog('trace', currentLevel) && console.debug(...args)
};

export type ClientLogger = typeof clientLogger;
export { clientLogger };
