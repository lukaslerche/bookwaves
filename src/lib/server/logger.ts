import pino from 'pino';
import { getConfig } from './config';
import { type LogLevel, parseLogLevel } from '#lib/logger/levels.js';

const defaultLevel: LogLevel = 'info';

function resolveLevel(): LogLevel {
	const configLevel = getConfig().log_level;
	const envLevel = process.env.LOG_LEVEL;
	return parseLogLevel(configLevel || envLevel, defaultLevel);
}

function createTransport() {
	const isProd = process.env.NODE_ENV === 'production';
	if (isProd) return undefined;

	// Pretty output for local development; omitted in production.
	return pino.transport({
		target: 'pino-pretty',
		options: {
			colorize: true,
			singleLine: false,
			translateTime: 'SYS:standard'
		}
	});
}

const logger = pino(
	{
		level: resolveLevel()
		//base: { app: 'bookwaves' }
	},
	createTransport()
);

export { logger };
