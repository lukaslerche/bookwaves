import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { type LogLevel, parseLogLevel } from '$lib/logger/levels';
import { locales, type Locale } from '$lib/paraglide/runtime';
import type { LoginHelpImageConfig } from '$lib/types/login';
import type { CoverImageProvider } from './lms/cover-image-provider';

export type LoginMode =
	| 'username_password'
	| 'username_only'
	| 'scanner_only'
	| 'username_or_scanner'
	| 'username_password_or_pin';

export type LoginValidationImplementation = 'campus_id';

export interface GateConfig {
	show_all_detected_items?: boolean;
}

export interface TaggingWhitelistConfig {
	values?: string[];
}

export interface TaggingFormats {
	name: string;
	description: string;
}

export interface TaggingConfig {
	whitelist?: TaggingWhitelistConfig;
	formats?: TaggingFormats[];
	focus?: boolean;
}

export interface MiddlewareInstanceConfig {
	id: string;
	type: string;
	url?: string; // Optional: not needed for mock middleware
}

export interface LoginConfig {
	mode?: LoginMode;
	login_help_image?: LoginHelpImageConfig;
	scanner_focus_assist?: boolean;
	top_aligned_modal?: boolean;
	validation?: LoginValidationConfig;
}

export interface LoginValidationCampusIdConfig {
	url?: string;
	api_key?: string;
}

export interface LoginValidationConfig {
	implementation?: LoginValidationImplementation;
	campus_id?: LoginValidationCampusIdConfig;
}

export interface ShelfCheck {
	check: string;
	value: string;
}

/**
 * The `MediaItem` fields a return rule may match on. A rule naming anything
 * else is a configuration error rather than a rule that silently never matches.
 */
export const RETURN_RULE_FIELDS = [
	'process_type',
	'library_code',
	'location_code',
	'shelving_library_code',
	'shelving_location_code',
	'has_request',
	'pickup_location_library'
] as const;
export type ReturnRuleField = (typeof RETURN_RULE_FIELDS)[number];

const RETURN_RULE_OPERATORS = ['in', 'not_in', 'equals', 'exists'] as const;
type ReturnRuleOperator = (typeof RETURN_RULE_OPERATORS)[number];

export interface ReturnRule {
	field: ReturnRuleField;
	in?: string[];
	not_in?: string[];
	equals?: string | boolean | number;
	exists?: boolean;
}

export interface ReturnCondition {
	any?: ReturnRule[];
	all?: ReturnRule[];
	always?: boolean;
}

/**
 * The circulation desk BookWaves scans an item in at a second time, to finish a
 * transit it was never meant to keep -- a hold whose shelf is at another desk.
 */
export interface CompleteTransitAt {
	library: string;
	circulation_desk: string;
}

export interface ReturnDirective {
	binId: string;
	message: Partial<Record<Locale, string>>;
	label: Partial<Record<Locale, string>>;
	color: string;
	when?: ReturnCondition;
	/**
	 * Where to scan the item in again so a transit it should not keep is resolved.
	 * Absent means leave the item wherever Alma put it.
	 */
	complete_transit_at?: CompleteTransitAt;
}

export interface CheckoutProfileConfig {
	id: string;
	type?: string;
	library: string;
	circulation_desk: string;
	return_directives: ReturnDirective[];
}

export interface CheckoutConfig {
	profiles?: CheckoutProfileConfig[];
	no_media_found_image?: string;
}

export interface ThemeGradientConfig {
	from?: string;
	to?: string;
}

export interface ThemePageBackgroundsConfig {
	home?: ThemeGradientConfig;
	checkout?: ThemeGradientConfig;
	gate?: ThemeGradientConfig;
	reader?: ThemeGradientConfig;
	tagging?: ThemeGradientConfig;
	admin?: ThemeGradientConfig;
}

export interface ThemeConfig {
	page_backgrounds?: ThemePageBackgroundsConfig;
	font?: string;
	logo?: string;
}

export interface LMSConfig {
	log_level?: LogLevel;
	lms: {
		type: string;
		api_key: string;
		cover_image_provider?: CoverImageProvider;
	};
	login?: LoginConfig;
	gate?: GateConfig;
	tagging?: TaggingConfig;
	checkout?: CheckoutConfig;
	theme?: ThemeConfig;
	middleware_instances: MiddlewareInstanceConfig[];
	/** Raw YAML; validated into `ReturnDirective[]` by `parseGlobalReturnDirectives`. */
	global_return_directives?: unknown;
}

const DEFAULT_LOGIN_MODE: LoginMode = 'username_password';
const DEFAULT_SCANNER_FOCUS_ASSIST = false;
const DEFAULT_TOP_ALIGNED_MODAL = false;
const VALID_LOGIN_MODES: LoginMode[] = [
	'username_password',
	'username_only',
	'scanner_only',
	'username_or_scanner',
	'username_password_or_pin'
];
const DEFAULT_GATE_CONFIG: Required<GateConfig> = {
	show_all_detected_items: true
};
const DEFAULT_TAGGING_CONFIG: Required<TaggingConfig> = {
	whitelist: {
		values: []
	},
	formats: [],
	focus: false
};
const DEFAULT_CHECKOUT_CONFIG: CheckoutConfig = {
	profiles: [],
	no_media_found_image: undefined
};
const DEFAULT_THEME_CONFIG: ThemeConfig = {
	page_backgrounds: {
		home: { from: '#2563eb', to: '#3730a3' },
		checkout: { from: 'var(--color-primary)', to: 'var(--color-secondary)' },
		gate: { from: 'var(--color-primary)', to: 'var(--color-secondary)' },
		reader: { from: 'var(--color-info)', to: 'var(--color-primary)' },
		tagging: { from: 'var(--color-info)', to: 'var(--color-primary)' },
		admin: { from: 'var(--color-base-200)', to: 'var(--color-base-300)' }
	},
	logo: undefined
};
function normalizeCssColor(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > 64) return undefined;
	if (/[;{}<>\n\r]/.test(trimmed)) return undefined;
	return trimmed;
}

function validateSource(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > 2048) return undefined;
	if (/[\s"'<>\n\r]/.test(trimmed)) return undefined;

	if (trimmed.startsWith('/')) return trimmed;
	if (/^https?:\/\//i.test(trimmed)) return trimmed;

	return undefined;
}

function validateHttpUrl(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > 2048) return undefined;
	if (/^https?:\/\//i.test(trimmed)) return trimmed;
	return undefined;
}

function parseLoginHelpImageConfig(value: unknown): LoginHelpImageConfig | undefined {
	const source = validateSource(value);
	if (source) return source;

	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

	const localizedSources: Partial<Record<Locale, string>> = {};
	const values = value as Partial<Record<Locale, unknown>>;

	for (const locale of locales) {
		const localizedSource = validateSource(values[locale]);
		if (localizedSource) {
			localizedSources[locale] = localizedSource;
		}
	}

	return Object.keys(localizedSources).length > 0 ? localizedSources : undefined;
}

function sanitizeNonEmptyString(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function parseLoginValidationConfig(
	login: LoginConfig | undefined
): LoginValidationConfig | undefined {
	const implementationRaw = sanitizeNonEmptyString(login?.validation?.implementation);
	if (!implementationRaw) return undefined;

	if (implementationRaw !== 'campus_id') {
		throw new Error(
			'Invalid configuration: login.validation.implementation must be "campus_id" or empty'
		);
	}

	return {
		implementation: implementationRaw,
		campus_id: {
			url: validateHttpUrl(login?.validation?.campus_id?.url),
			api_key: sanitizeNonEmptyString(login?.validation?.campus_id?.api_key)
		}
	};
}

function parseCoverImageProviderConfig(value: unknown): CoverImageProvider | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;

	const url = validateHttpUrl((value as { url?: unknown }).url);
	return url ? { url } : undefined;
}

function parseLmsConfig(data: LMSConfig): LMSConfig['lms'] {
	return {
		...data.lms,
		cover_image_provider: parseCoverImageProviderConfig(data.lms.cover_image_provider)
	};
}

function parseGateConfig(data: LMSConfig): GateConfig {
	return {
		show_all_detected_items:
			typeof data.gate?.show_all_detected_items === 'boolean'
				? data.gate.show_all_detected_items
				: DEFAULT_GATE_CONFIG.show_all_detected_items
	};
}

function parseTaggingConfig(data: LMSConfig): TaggingConfig {
	return {
		whitelist: {
			values: Array.isArray(data.tagging?.whitelist?.values)
				? data.tagging.whitelist.values.filter(
						(value) => typeof value === 'string' && value.trim().length > 0
					)
				: DEFAULT_TAGGING_CONFIG.whitelist.values
		},
		formats: Array.isArray(data.tagging?.formats)
			? data.tagging.formats.filter(
					(format) =>
						!!format &&
						typeof format === 'object' &&
						typeof format.name === 'string' &&
						format.name.trim().length > 0 &&
						typeof format.description === 'string' &&
						format.description.trim().length > 0
				)
			: DEFAULT_TAGGING_CONFIG.formats,
		focus:
			typeof data.tagging?.focus === 'boolean' ? data.tagging.focus : DEFAULT_TAGGING_CONFIG.focus
	};
}

function parseLocalizedText(value: unknown, path: string): Partial<Record<Locale, string>> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`Invalid configuration: ${path} must be a map of locale to text`);
	}

	const values = value as Partial<Record<Locale, unknown>>;

	// A non-locale key is almost always a `when` block that lost an indentation
	// level and landed inside the text above it. Unchecked it is dropped in
	// silence, and the directive it belonged to is dead without saying so.
	const unknownKeys = Object.keys(values).filter(
		(key) => !(locales as readonly string[]).includes(key)
	);
	if (unknownKeys.length > 0) {
		throw new Error(
			`Invalid configuration: ${path} has unknown key(s): ${unknownKeys.join(', ')}. ` +
				`Only locales are allowed here (${locales.join(', ')}). ` +
				`A "when" key in this list is indented one level too deep.`
		);
	}

	const localized: Partial<Record<Locale, string>> = {};
	for (const locale of locales) {
		const text = sanitizeNonEmptyString(values[locale]);
		if (text) localized[locale] = text;
	}

	if (Object.keys(localized).length === 0) {
		throw new Error(
			`Invalid configuration: ${path} must define text for at least one of: ${locales.join(', ')}`
		);
	}

	return localized;
}

function parseReturnRule(value: unknown, path: string): ReturnRule {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`Invalid configuration: ${path} must be an object`);
	}

	const raw = value as Record<string, unknown>;
	const field = sanitizeNonEmptyString(raw.field);
	if (!field || !RETURN_RULE_FIELDS.includes(field as ReturnRuleField)) {
		throw new Error(
			`Invalid configuration: ${path}.field must be one of: ${RETURN_RULE_FIELDS.join(', ')}`
		);
	}

	// Catches `equal: true` and friends, which would otherwise parse as a rule
	// that can never match.
	const unknownKeys = Object.keys(raw).filter(
		(key) => key !== 'field' && !RETURN_RULE_OPERATORS.includes(key as ReturnRuleOperator)
	);
	if (unknownKeys.length > 0) {
		throw new Error(
			`Invalid configuration: ${path} has unknown key(s) ${unknownKeys.join(', ')}; ` +
				`expected one of: ${RETURN_RULE_OPERATORS.join(', ')}`
		);
	}

	const operators = RETURN_RULE_OPERATORS.filter((operator) => raw[operator] !== undefined);
	if (operators.length !== 1) {
		throw new Error(
			`Invalid configuration: ${path} must use exactly one of: ${RETURN_RULE_OPERATORS.join(', ')}`
		);
	}

	const rule: ReturnRule = { field: field as ReturnRuleField };
	const [operator] = operators;

	if (operator === 'in' || operator === 'not_in') {
		const list = raw[operator];
		if (!Array.isArray(list) || list.length === 0) {
			throw new Error(`Invalid configuration: ${path}.${operator} must be a non-empty array`);
		}
		rule[operator] = list.map((entry) => String(entry));
		return rule;
	}

	if (operator === 'exists') {
		if (typeof raw.exists !== 'boolean') {
			throw new Error(`Invalid configuration: ${path}.exists must be a boolean`);
		}
		rule.exists = raw.exists;
		return rule;
	}

	const equals = raw.equals;
	if (typeof equals !== 'string' && typeof equals !== 'boolean' && typeof equals !== 'number') {
		throw new Error(`Invalid configuration: ${path}.equals must be a string, boolean or number`);
	}
	rule.equals = equals;
	return rule;
}

function parseReturnCondition(value: unknown, path: string): ReturnCondition {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`Invalid configuration: ${path} must be an object`);
	}

	const raw = value as Record<string, unknown>;
	const condition: ReturnCondition = {};

	if (raw.always !== undefined) {
		if (typeof raw.always !== 'boolean') {
			throw new Error(`Invalid configuration: ${path}.always must be a boolean`);
		}
		condition.always = raw.always;
	}

	for (const key of ['any', 'all'] as const) {
		const rules = raw[key];
		if (rules === undefined) continue;
		if (!Array.isArray(rules) || rules.length === 0) {
			throw new Error(`Invalid configuration: ${path}.${key} must be a non-empty array`);
		}
		condition[key] = rules.map((rule, index) => parseReturnRule(rule, `${path}.${key}[${index}]`));
	}

	if (condition.always === undefined && !condition.any && !condition.all) {
		throw new Error(`Invalid configuration: ${path} must define at least one of: any, all, always`);
	}

	return condition;
}

function parseCompleteTransitAt(value: unknown, path: string): CompleteTransitAt {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`Invalid configuration: ${path} must be an object`);
	}

	const raw = value as Record<string, unknown>;
	const library = sanitizeNonEmptyString(raw.library);
	const circulationDesk = sanitizeNonEmptyString(raw.circulation_desk);
	if (!library || !circulationDesk) {
		throw new Error(`Invalid configuration: ${path} requires both library and circulation_desk`);
	}

	return { library, circulation_desk: circulationDesk };
}

function parseReturnDirective(value: unknown, path: string): ReturnDirective {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`Invalid configuration: ${path} must be an object`);
	}

	const raw = value as Record<string, unknown>;
	const binId = sanitizeNonEmptyString(raw.binId);
	if (!binId) {
		throw new Error(`Invalid configuration: ${path}.binId is required`);
	}

	const color = normalizeCssColor(raw.color);
	if (!color) {
		throw new Error(`Invalid configuration: ${path}.color is required and must be a CSS colour`);
	}

	// Parsed before the `when` check below on purpose: a misindented `when` shows
	// up here as an unknown key, and naming that key points at the typo, where the
	// missing condition it causes only reports the symptom.
	const label = parseLocalizedText(raw.label, `${path}.label`);
	const message = parseLocalizedText(raw.message, `${path}.message`);

	// A global cart with no condition can never match. Profile entries are
	// different: they omit `when` to inherit the global one, parsed elsewhere.
	if (raw.when === undefined) {
		throw new Error(
			`Invalid configuration: ${path}.when is required. ` +
				`A directive with no condition can never match, so it would be silently dead.`
		);
	}

	return {
		binId,
		label,
		message,
		color,
		when: parseReturnCondition(raw.when, `${path}.when`),
		complete_transit_at:
			raw.complete_transit_at === undefined
				? undefined
				: parseCompleteTransitAt(raw.complete_transit_at, `${path}.complete_transit_at`)
	};
}

/** Without a catch-all, a returned item can fall off the end of the list and get no instruction. */
function requireCatchAllDirective(directives: ReturnDirective[], path: string, hint: string): void {
	if (directives.some((directive) => directive.when?.always === true)) return;
	throw new Error(
		`Invalid configuration: ${path} must include a catch-all directive (when.always: true) ` +
			`so every returned item is assigned a return cart${hint}`
	);
}

function parseGlobalReturnDirectives(data: LMSConfig): ReturnDirective[] {
	// Absent configuration means the feature is off: no directives, no badge.
	if (data.global_return_directives === undefined) return [];

	if (!Array.isArray(data.global_return_directives)) {
		throw new Error('Invalid configuration: global_return_directives must be an array');
	}

	const directives = data.global_return_directives.map((directive, index) =>
		parseReturnDirective(directive, `global_return_directives[${index}]`)
	);

	const seen = new Set<string>();
	for (const directive of directives) {
		if (seen.has(directive.binId)) {
			throw new Error(
				`Invalid configuration: duplicate global_return_directives binId "${directive.binId}"`
			);
		}
		seen.add(directive.binId);
	}

	requireCatchAllDirective(directives, 'global_return_directives', '');
	return directives;
}

/**
 * Resolves one profile-level entry against the global directive it references.
 * Only the keys present on the override replace the global values, so a bare
 * `- binId: main` inherits the global definition wholesale.
 */
function mergeReturnDirective(
	globalDirectives: ReturnDirective[],
	value: unknown,
	path: string
): ReturnDirective {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`Invalid configuration: ${path} must be an object`);
	}

	const raw = value as Record<string, unknown>;
	const binId = sanitizeNonEmptyString(raw.binId);
	if (!binId) {
		throw new Error(`Invalid configuration: ${path}.binId is required`);
	}

	const base = globalDirectives.find((directive) => directive.binId === binId);
	if (!base) {
		throw new Error(
			`Invalid configuration: ${path}.binId "${binId}" has no matching entry in global_return_directives`
		);
	}

	const color = raw.color === undefined ? base.color : normalizeCssColor(raw.color);
	if (!color) {
		throw new Error(`Invalid configuration: ${path}.color must be a CSS colour`);
	}

	return {
		binId,
		label: raw.label === undefined ? base.label : parseLocalizedText(raw.label, `${path}.label`),
		message:
			raw.message === undefined ? base.message : parseLocalizedText(raw.message, `${path}.message`),
		color,
		when: raw.when === undefined ? base.when : parseReturnCondition(raw.when, `${path}.when`),
		complete_transit_at:
			raw.complete_transit_at === undefined
				? base.complete_transit_at
				: parseCompleteTransitAt(raw.complete_transit_at, `${path}.complete_transit_at`)
	};
}

function parseProfileReturnDirectives(
	globalDirectives: ReturnDirective[],
	value: unknown,
	path: string
): ReturnDirective[] {
	// A profile that says nothing inherits the global set, including its emptiness.
	if (value === undefined) return globalDirectives;

	if (!Array.isArray(value)) {
		throw new Error(`Invalid configuration: ${path} must be an array`);
	}

	// An explicit empty list opts this desk out of carts entirely. The catch-all
	// rule guards a populated list; there is nothing here to fall off the end of.
	if (value.length === 0) return [];

	const directives = value.map((directive, index) =>
		mergeReturnDirective(globalDirectives, directive, `${path}[${index}]`)
	);

	requireCatchAllDirective(
		directives,
		path,
		'; add the bin that defines it, for example "- binId: main"'
	);
	return directives;
}

function parseCheckoutProfiles(data: LMSConfig): CheckoutProfileConfig[] {
	if (data.checkout?.profiles === undefined) return DEFAULT_CHECKOUT_CONFIG.profiles ?? [];

	if (!Array.isArray(data.checkout.profiles)) {
		throw new Error('Invalid configuration: checkout.profiles must be an array');
	}

	const lmsType = typeof data.lms?.type === 'string' ? data.lms.type : '';
	const globalReturnDirectives = parseGlobalReturnDirectives(data);

	return data.checkout.profiles.map((profile, index) => {
		if (!profile || typeof profile !== 'object') {
			throw new Error(`Invalid configuration: checkout.profiles[${index}] must be an object`);
		}

		const id = typeof profile.id === 'string' ? profile.id.trim() : '';
		const library = typeof profile.library === 'string' ? profile.library.trim() : '';
		const circulationDesk =
			typeof profile.circulation_desk === 'string' ? profile.circulation_desk.trim() : '';
		const type = typeof profile.type === 'string' ? profile.type.trim() : lmsType;
		const returnDirectives = parseProfileReturnDirectives(
			globalReturnDirectives,
			profile.return_directives,
			`checkout.profiles[${index}].return_directives`
		);

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
			circulation_desk: circulationDesk,
			return_directives: returnDirectives
		};
	});
}

function parseCheckoutConfig(data: LMSConfig): CheckoutConfig {
	return {
		profiles: parseCheckoutProfiles(data),
		no_media_found_image:
			validateSource(data.checkout?.no_media_found_image) ??
			DEFAULT_CHECKOUT_CONFIG.no_media_found_image
	};
}

function validateConfigData(data: LMSConfig, requireTaggingFormats: boolean): void {
	if (data.login?.mode && !VALID_LOGIN_MODES.includes(data.login.mode)) {
		throw new Error(
			`Invalid configuration: login.mode must be one of ${VALID_LOGIN_MODES.join(', ')}`
		);
	}

	if (!data.lms || !data.lms.type) {
		throw new Error('Invalid configuration: lms.type is required');
	}

	if (requireTaggingFormats && (!data.tagging?.formats || !Array.isArray(data.tagging.formats))) {
		throw new Error('Invalid configuration for RPTU: tagging.formats must be set and be an array');
	}

	if (!data.middleware_instances || !Array.isArray(data.middleware_instances)) {
		throw new Error('Invalid configuration: middleware_instances must be an array');
	}
}

function normalizeConfigData(data: LMSConfig, requireTaggingFormats: boolean): LMSConfig {
	validateConfigData(data, requireTaggingFormats);

	const parsedLoginMode = data.login?.mode ?? DEFAULT_LOGIN_MODE;

	data.log_level = parseLogLevel(data.log_level, 'info');
	data.lms = parseLmsConfig(data);
	data.login = {
		mode: parsedLoginMode,
		login_help_image: parseLoginHelpImageConfig(data.login?.login_help_image),
		scanner_focus_assist:
			typeof data.login?.scanner_focus_assist === 'boolean'
				? data.login.scanner_focus_assist
				: DEFAULT_SCANNER_FOCUS_ASSIST,
		top_aligned_modal:
			typeof data.login?.top_aligned_modal === 'boolean'
				? data.login.top_aligned_modal
				: DEFAULT_TOP_ALIGNED_MODAL,
		validation: parseLoginValidationConfig(data.login)
	};
	data.gate = parseGateConfig(data);
	data.tagging = parseTaggingConfig(data);
	data.checkout = parseCheckoutConfig(data);
	data.theme = parseThemeConfig(data.theme);

	return data;
}

function parseThemeConfig(theme: ThemeConfig | undefined): ThemeConfig {
	const homeDefault = DEFAULT_THEME_CONFIG.page_backgrounds?.home;
	const checkoutDefault = DEFAULT_THEME_CONFIG.page_backgrounds?.checkout;
	const gateDefault = DEFAULT_THEME_CONFIG.page_backgrounds?.gate;
	const readerDefault = DEFAULT_THEME_CONFIG.page_backgrounds?.reader;
	const taggingDefault = DEFAULT_THEME_CONFIG.page_backgrounds?.tagging;
	const adminDefault = DEFAULT_THEME_CONFIG.page_backgrounds?.admin;

	return {
		page_backgrounds: {
			home: {
				from:
					normalizeCssColor(theme?.page_backgrounds?.home?.from) ?? homeDefault?.from ?? '#2563eb',
				to: normalizeCssColor(theme?.page_backgrounds?.home?.to) ?? homeDefault?.to ?? '#3730a3'
			},
			checkout: {
				from:
					normalizeCssColor(theme?.page_backgrounds?.checkout?.from) ??
					checkoutDefault?.from ??
					'var(--color-primary)',
				to:
					normalizeCssColor(theme?.page_backgrounds?.checkout?.to) ??
					checkoutDefault?.to ??
					'var(--color-secondary)'
			},
			gate: {
				from:
					normalizeCssColor(theme?.page_backgrounds?.gate?.from) ??
					gateDefault?.from ??
					'var(--color-primary)',
				to:
					normalizeCssColor(theme?.page_backgrounds?.gate?.to) ??
					gateDefault?.to ??
					'var(--color-secondary)'
			},
			reader: {
				from:
					normalizeCssColor(theme?.page_backgrounds?.reader?.from) ??
					readerDefault?.from ??
					'var(--color-info)',
				to:
					normalizeCssColor(theme?.page_backgrounds?.reader?.to) ??
					readerDefault?.to ??
					'var(--color-primary)'
			},
			tagging: {
				from:
					normalizeCssColor(theme?.page_backgrounds?.tagging?.from) ??
					taggingDefault?.from ??
					'var(--color-info)',
				to:
					normalizeCssColor(theme?.page_backgrounds?.tagging?.to) ??
					taggingDefault?.to ??
					'var(--color-primary)'
			},
			admin: {
				from:
					normalizeCssColor(theme?.page_backgrounds?.admin?.from) ??
					adminDefault?.from ??
					'var(--color-base-200)',
				to:
					normalizeCssColor(theme?.page_backgrounds?.admin?.to) ??
					adminDefault?.to ??
					'var(--color-base-300)'
			}
		},
		logo: validateSource(theme?.logo) ?? DEFAULT_THEME_CONFIG.logo,
		font: validateSource(theme?.font) ?? DEFAULT_THEME_CONFIG.font
	};
}

const EMBEDDED_CONFIG_YAML = `# Copy this file to config.yaml and update with your actual values

lms:
  type: mock # LMS type: alma, koha, etc.
  api_key: your_api_key # API key for authentication
  # cover_image_provider:
  #   # Optional base endpoint. BookWaves appends ?isbn=ISBN1,ISBN2.
  #   # When configured, items without ISBNs do not fall back to generated covers.
  #   url: 'https://api.ub.tu-dortmund.de/ccm/cover'

log_level: info # Logging level: fatal, error, warn, info, debug, trace, silent

# Login flow configuration
login:
  mode: username_password # username_password (default), username_password_or_pin, username_only, scanner_only, or username_or_scanner
  # login_help_image: '/branding/login-help.png' # optional; supports /absolute/path or https:// URL
  # login_help_image: # optional; supports /absolute/path or https:// URL per locale
  #   de: '/branding/login-help-de.png'
  #   en: '/branding/login-help-en.png'
  # scanner_focus_assist: false # optional; for scanner-driven kiosks. Expects fast input of at least 4 characters ending with Tab or Enter.
  # top_aligned_modal: false # optional; moves the login modal near the top with 3rem spacing for on-screen keyboards.
  # validation:
  #   implementation: campus_id # empty/missing means scanner values are used directly for login
  #   campus_id:
  #     url: 'https://katalog.ub.tu-dortmund.de/account/api/validate'
  #     api_key: 'replace_me'

checkout:
  profiles:
    # The profile id is used via the checkout_profile_id URL param on checkout pages
    - id: terminal1
      type: alma
      library: MAIN_LIBRARY
      circulation_desk: SELF-CHECKOUT-CIRC1
    - id: terminal2
      type: alma
      library: MAIN_LIBRARY
      circulation_desk: SELF-CHECKOUT-CIRC2

# Security gate display configuration
gate:
  show_all_detected_items: true # If false, only secured items are shown/warned

tagging:
  whitelist:
    values:
      - 'E2806894'
      - 'E1111111' # Add additional allowed tag prefixes as needed

  formats:
    - name: DE386 # Tag format
      description: "RPTU Standort Kaiserslatern" # Human readable name
    - name: DE290 # Tag format
      description: "Dortmunder Format" # Human readable name

theme:
    #logo: "/branding/logo.png" # optional; supports /absolute/path or https:// URL
    #font: "/branding/font.ttf" # optional; supports /absolute/path or https:// URL
  page_backgrounds:
    home:
      from: "#2563eb"
      to: "#3730a3"
    checkout:
      from: "var(--color-primary)"
      to: "var(--color-secondary)"
    gate:
      from: "var(--color-primary)"
      to: "var(--color-secondary)"
    reader:
      from: "var(--color-info)"
      to: "var(--color-primary)"
    tagging:
      from: "var(--color-info)"
      to: "var(--color-primary)"
    admin:
      from: "var(--color-base-200)"
      to: "var(--color-base-300)"

middleware_instances:
  #- id: feig1
  #  type: feig # Middleware vendor/type: feig, bibliotheca, etc.
  #  url: http://localhost:7070
  - id: mock1
    type: mock # Mock middleware for testing (no URL needed)
`;
let cachedConfig: LMSConfig | null = null;

export function getConfig(): LMSConfig {
	if (cachedConfig) return cachedConfig;

	if (process.env.VERCEL) {
		const data = YAML.parse(EMBEDDED_CONFIG_YAML) as LMSConfig;
		cachedConfig = normalizeConfigData(data, true);
		return data;
	}

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

		cachedConfig = {
			log_level: 'info',
			lms: { type: 'mock', api_key: '' },
			login: {
				mode: DEFAULT_LOGIN_MODE,
				scanner_focus_assist: DEFAULT_SCANNER_FOCUS_ASSIST,
				top_aligned_modal: DEFAULT_TOP_ALIGNED_MODAL
			},
			gate: DEFAULT_GATE_CONFIG,
			tagging: DEFAULT_TAGGING_CONFIG,
			checkout: DEFAULT_CHECKOUT_CONFIG,
			theme: parseThemeConfig(undefined),
			middleware_instances: []
		};
		return cachedConfig;
	}

	const fileContents = fs.readFileSync(filePath, 'utf8');
	const data = YAML.parse(fileContents) as LMSConfig;
	cachedConfig = normalizeConfigData(data, false);
	return data;
}

export function clearConfigCache(): void {
	cachedConfig = null;
}
