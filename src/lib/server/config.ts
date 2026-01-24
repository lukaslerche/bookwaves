import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { type LogLevel, parseLogLevel } from '$lib/logger/levels';

export type LoginMode = 'username_password' | 'username_only';

export interface GateConfig {
	show_all_detected_items?: boolean;
}

export interface TaggingWhitelistConfig {
	values?: string[];
}

export interface TaggingConfig {
	whitelist?: TaggingWhitelistConfig;
}

export interface MiddlewareInstanceConfig {
	id: string;
	type: string;
	url?: string; // Optional: not needed for mock middleware
}

export interface LoginConfig {
	mode?: LoginMode;
}

export interface CheckoutProfileConfig {
	id: string;
	type?: string;
	library: string;
	circulation_desk: string;
}

export interface CheckoutConfig {
	profiles?: CheckoutProfileConfig[];
}

export interface LMSConfig {
	log_level?: LogLevel;
	lms: {
		type: string;
		api_key: string;
	};
	login?: LoginConfig;
	gate?: GateConfig;
	tagging?: TaggingConfig;
	checkout?: CheckoutConfig;
	middleware_instances: MiddlewareInstanceConfig[];
}

const DEFAULT_LOGIN_MODE: LoginMode = 'username_password';
const VALID_LOGIN_MODES: LoginMode[] = ['username_password', 'username_only'];
const DEFAULT_GATE_CONFIG: Required<GateConfig> = {
	show_all_detected_items: true
};
const DEFAULT_TAGGING_CONFIG: Required<TaggingConfig> = {
	whitelist: {
		values: []
	}
};
const DEFAULT_CHECKOUT_CONFIG: CheckoutConfig = { profiles: [] };

let cachedConfig: LMSConfig | null = null;

export function getConfig(): LMSConfig {
	if (cachedConfig) return cachedConfig;

	const allowMissing = process.env.ALLOW_MISSING_CONFIG === 'true';
	const candidatePaths = [process.env.CONFIG_FILE_PATH, 'config.yaml', 'config.example.yaml']
		.filter(Boolean)
		.map((p) => path.resolve(p as string));
	const filePath = candidatePaths.find((p) => fs.existsSync(p));

	if (!filePath) {
		if (!allowMissing) {
			throw new Error(
				'Configuration file not found: checked CONFIG_FILE_PATH, config.yaml, config.example.yaml'
			);
		}

		// Fallback for build environments where the real config is not baked into the image.
		cachedConfig = {
			log_level: 'info',
			lms: { type: 'mock', api_key: '' },
			login: { mode: DEFAULT_LOGIN_MODE },
			gate: DEFAULT_GATE_CONFIG,
			tagging: DEFAULT_TAGGING_CONFIG,
			checkout: DEFAULT_CHECKOUT_CONFIG,
			middleware_instances: []
		};
		return cachedConfig;
	}

	const fileContents = fs.readFileSync(filePath, 'utf8');
	const data = YAML.parse(fileContents) as LMSConfig;

	const parsedLoginMode = data.login?.mode ?? DEFAULT_LOGIN_MODE;
	const parsedGateConfig: GateConfig = {
		show_all_detected_items:
			typeof data.gate?.show_all_detected_items === 'boolean'
				? data.gate.show_all_detected_items
				: DEFAULT_GATE_CONFIG.show_all_detected_items
	};

	const parsedTaggingConfig: TaggingConfig = {
		whitelist: {
			values: Array.isArray(data.tagging?.whitelist?.values)
				? data.tagging.whitelist.values.filter(
						(value) => typeof value === 'string' && value.trim().length > 0
					)
				: DEFAULT_TAGGING_CONFIG.whitelist.values
		}
	};

	const parseCheckoutProfiles = (): CheckoutProfileConfig[] => {
		if (data.checkout?.profiles === undefined) return DEFAULT_CHECKOUT_CONFIG.profiles ?? [];

		if (!Array.isArray(data.checkout.profiles)) {
			throw new Error('Invalid configuration: checkout.profiles must be an array');
		}

		const lmsType = typeof data.lms?.type === 'string' ? data.lms.type : '';

		return data.checkout.profiles.map((profile, index) => {
			if (!profile || typeof profile !== 'object') {
				throw new Error(`Invalid configuration: checkout.profiles[${index}] must be an object`);
			}

			const id = typeof profile.id === 'string' ? profile.id.trim() : '';
			const library = typeof profile.library === 'string' ? profile.library.trim() : '';
			const circulationDesk =
				typeof profile.circulation_desk === 'string' ? profile.circulation_desk.trim() : '';
			const type = typeof profile.type === 'string' ? profile.type.trim() : lmsType;

			if (!id || !library || !circulationDesk) {
				throw new Error(
					`Invalid configuration: checkout.profiles[${index}] must include id, library, and circulation_desk`
				);
			}
			if (!type) {
				throw new Error(
					'Invalid configuration: lms.type is required when checkout profiles are defined'
				);
			}

			return {
				id,
				type,
				library,
				circulation_desk: circulationDesk
			};
		});
	};

	const parsedCheckoutConfig: CheckoutConfig = {
		profiles: parseCheckoutProfiles()
	};

	if (data.login?.mode && !VALID_LOGIN_MODES.includes(data.login.mode)) {
		throw new Error(
			`Invalid configuration: login.mode must be one of ${VALID_LOGIN_MODES.join(', ')}`
		);
	}

	// Basic validation
	if (!data.lms || !data.lms.type) {
		throw new Error('Invalid configuration: lms.type is required');
	}

	if (!data.middleware_instances || !Array.isArray(data.middleware_instances)) {
		throw new Error('Invalid configuration: middleware_instances must be an array');
	}

	data.log_level = parseLogLevel(data.log_level, 'info');
	data.login = { mode: parsedLoginMode };
	data.gate = parsedGateConfig;
	data.tagging = parsedTaggingConfig;
	data.checkout = parsedCheckoutConfig;

	cachedConfig = data;
	return data;
}

export function clearConfigCache(): void {
	cachedConfig = null;
}
