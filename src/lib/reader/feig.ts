import { browser } from '$app/environment';
import type {
	RFIDReader,
	RFIDData,
	RFIDEventCallback,
	ReaderInfo,
	AnalyzeResult
} from './interface';
import * as v from 'valibot';
import { clientLogger } from '$lib/client/logger';

export interface FeigReaderConfig {
	/** Base URL of the Feig API server */
	baseUrl?: string;
	/** Name of the reader to use */
	readerName: string;
}

// Normalize middleware base URLs so relative paths work both client- and server-side.
const normalizeBaseUrl = (url?: string): string => {
	const raw = url || 'http://localhost:7070';
	const hasProtocol = /^https?:\/\//i.test(raw);
	if (hasProtocol) return raw.replace(/\/+$/, '');

	// In the browser, resolve against the current origin.
	if (browser && typeof window !== 'undefined') {
		return new URL(raw, window.location.origin).toString().replace(/\/+$/, '');
	}

	// On the server:
	// If FEIG_INTERNAL_URL is set, treat it as the full base (do not append the relative path).
	const serverOverride = process.env.FEIG_INTERNAL_URL;
	if (serverOverride) {
		return serverOverride.replace(/\/+$/, '');
	}

	// Otherwise, resolve the relative path against a fallback origin.
	const serverOrigin = process.env.ORIGIN || 'http://localhost:7070';
	return new URL(raw, serverOrigin).toString().replace(/\/+$/, '');
};

const RssiValueSchema = v.object({
	antennaNumber: v.number(),
	rssi: v.number()
});

const InventoryTagSchema = v.object({
	rssiValues: v.array(RssiValueSchema),
	secured: v.boolean(),
	mediaId: v.string(),
	tagType: v.string(),
	epc: v.string(),
	pc: v.string()
});

const InventoryResponseSchema = v.object({
	success: v.boolean(),
	message: v.string(),
	tagCount: v.number(),
	tags: v.optional(v.array(InventoryTagSchema))
});

type InventoryTag = v.InferOutput<typeof InventoryTagSchema>;

const ReaderSchema = v.object({
	name: v.string(),
	address: v.string(),
	port: v.number(),
	mode: v.string(),
	antennas: v.union([v.array(v.number()), v.number()]),
	antennaMask: v.optional(v.string()),
	isConnected: v.boolean(),
	connectionStatus: v.optional(v.string()),
	notificationActive: v.optional(v.boolean()),
	notificationPort: v.optional(v.number())
});

const ReadersResponseSchema = v.object({
	success: v.boolean(),
	readerCount: v.optional(v.number()),
	readers: v.array(ReaderSchema)
});

type ReaderResponse = v.InferOutput<typeof ReaderSchema>;

const EpcBankAnalysisSchema = v.object({
	readSuccess: v.boolean(),
	pcValue: v.optional(v.string()),
	epcLengthInWords: v.optional(v.number()),
	epcLengthInBytes: v.optional(v.number()),
	actual: v.optional(v.string()),
	theoretical: v.optional(v.string()),
	matches: v.optional(v.boolean())
});

const TidBankAnalysisSchema = v.object({
	readSuccess: v.boolean(),
	lengthBytes: v.optional(v.number()),
	tidHex: v.optional(v.string())
});

const ReservedBankAnalysisSchema = v.object({
	readableWithoutAuth: v.optional(v.boolean()),
	readableWithAuth: v.optional(v.boolean()),
	theoretical: v.optional(v.string()),
	actual: v.optional(v.string()),
	matches: v.optional(v.boolean()),
	passwordsAreZero: v.optional(v.boolean()),
	passwordProtectionConfigured: v.optional(v.boolean()),
	passwordProtectionRequired: v.optional(v.boolean()),
	passwordCorrect: v.optional(v.boolean()),
	passwordMismatch: v.optional(v.boolean()),
	passwordProtected: v.optional(v.boolean()),
	passwordsMatch: v.optional(v.boolean())
});

const LockStatusAnalysisSchema = v.object({
	reservedBank: v.optional(v.string()),
	reservedBankStatus: v.optional(v.string())
});

const SecurityAssessmentAnalysisSchema = v.object({
	properlySecured: v.optional(v.boolean()),
	passwordCorrect: v.optional(v.boolean()),
	issues: v.optional(v.array(v.string())),
	passwordProtectionConfigured: v.optional(v.boolean()),
	passwordProtectionRequired: v.optional(v.boolean())
});

const TagAnalysisSchema = v.object({
	tagType: v.optional(v.string()),
	mediaId: v.optional(v.string()),
	epcBank: v.optional(EpcBankAnalysisSchema),
	tidBank: v.optional(TidBankAnalysisSchema),
	reservedBank: v.optional(ReservedBankAnalysisSchema),
	lockStatus: v.optional(LockStatusAnalysisSchema),
	securityAssessment: v.optional(SecurityAssessmentAnalysisSchema)
});

const AnalyzeResponseSchema = v.object({
	success: v.boolean(),
	epc: v.optional(v.string()),
	message: v.optional(v.string()),
	error: v.optional(v.string()),
	analysis: v.optional(TagAnalysisSchema)
});

type AnalyzeResponse = v.InferOutput<typeof AnalyzeResponseSchema>;

const NotificationRssiValueSchema = v.object({
	antenna: v.optional(v.number()),
	antennaNumber: v.optional(v.number()),
	rssi: v.number()
});

const NotificationTagEventSchema = v.object({
	readerName: v.optional(v.string()),
	timestamp: v.optional(v.string()),
	eventType: v.optional(v.string()),
	epc: v.string(),
	tagType: v.optional(v.string()),
	mediaId: v.optional(v.string()),
	secured: v.optional(v.boolean()),
	pc: v.optional(v.string()),
	rssiValues: v.optional(v.array(NotificationRssiValueSchema)),
	readerTimestamp: v.optional(v.string()),
	stable: v.optional(v.boolean()),
	seenCount: v.optional(v.number()),
	presenceDurationMs: v.optional(v.number()),
	bestRssi: v.optional(v.number())
});

type NotificationTagEvent = v.InferOutput<typeof NotificationTagEventSchema>;

export class FeigRFIDReader implements RFIDReader {
	private baseUrl: string;
	private readerName: string;
	private monitoringInterval?: NodeJS.Timeout;
	private eventSource?: EventSource;
	private callbacks: Set<RFIDEventCallback> = new Set();
	private lastKnownItems: Map<string, RFIDData> = new Map();

	constructor(config: FeigReaderConfig) {
		this.baseUrl = normalizeBaseUrl(config.baseUrl);
		this.readerName = config.readerName;
	}

	async inventory(): Promise<RFIDData[]> {
		try {
			const response = await fetch(`${this.baseUrl}/inventory/${this.readerName}`);
			if (!response.ok) {
				throw new Error(`Inventory failed: ${response.statusText}`);
			}

			const data = await response.json();
			const parsed = v.safeParse(InventoryResponseSchema, data);
			if (!parsed.success) {
				clientLogger.error('Invalid inventory response:', parsed.issues);
				throw new Error('Inventory response validation failed');
			}

			if (!parsed.output.success) {
				throw new Error(parsed.output.message || 'Inventory failed');
			}

			return this.convertToRFIDData(parsed.output.tags ?? []);
		} catch (error) {
			clientLogger.error('Failed to get items:', error);
			throw error;
		}
	}

	startMonitoring(callback: RFIDEventCallback): () => void {
		const hadSubscribers = this.callbacks.size > 0;
		this.callbacks.add(callback);

		if (!hadSubscribers) {
			this.startSseMonitoring();
		}

		// Return unsubscribe function
		return () => {
			this.callbacks.delete(callback);
			if (this.callbacks.size === 0) {
				this.stopAllMonitoringTransports();
			}
		};
	}

	async stopMonitoring(): Promise<void> {
		this.stopAllMonitoringTransports();
		this.callbacks.clear();
		this.lastKnownItems.clear();
	}

	async secure(epc: string): Promise<{
		success: boolean;
		epc?: string;
		tagType?: string;
		message?: string;
		secured?: boolean;
	}> {
		try {
			const useNotificationEndpoint = await this.isNotificationMode();
			const endpoint = useNotificationEndpoint ? 'notification/secure' : 'secure';
			const response = await fetch(
				`${this.baseUrl}/${endpoint}/${this.readerName}?epc=${encodeURIComponent(epc)}`,
				{ method: 'POST' }
			);

			const result = await response.json();
			return {
				success: result.success === true,
				epc: result.epc ?? epc,
				tagType: result.tagType,
				message: result.message ?? result.error,
				secured: result.secured
			};
		} catch (error) {
			clientLogger.error('Failed to secure item:', error);
			return {
				success: false,
				epc,
				message: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	async unsecure(epc: string): Promise<{
		success: boolean;
		epc?: string;
		tagType?: string;
		message?: string;
		secured?: boolean;
	}> {
		try {
			const useNotificationEndpoint = await this.isNotificationMode();
			const endpoint = useNotificationEndpoint ? 'notification/unsecure' : 'unsecure';
			const response = await fetch(
				`${this.baseUrl}/${endpoint}/${this.readerName}?epc=${encodeURIComponent(epc)}`,
				{ method: 'POST' }
			);

			const result = await response.json();
			return {
				success: result.success === true,
				epc: result.epc ?? epc,
				tagType: result.tagType,
				message: result.message ?? result.error,
				secured: result.secured
			};
		} catch (error) {
			clientLogger.error('Failed to unsecure item:', error);
			return {
				success: false,
				epc,
				message: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	async read(epc: string): Promise<RFIDData | null> {
		try {
			const items = await this.inventory();
			return items.find((item) => item.id === epc) || null;
		} catch (error) {
			clientLogger.error('Failed to read item:', error);
			return null;
		}
	}

	async kill(epc: string): Promise<boolean> {
		// Kill operation not exposed in current API
		clientLogger.debug('Kill requested for EPC:', epc);
		clientLogger.warn('Kill operation not implemented in Feig API');
		return false;
	}

	async initialize(
		mediaId: string,
		format?: string,
		secured: boolean = true
	): Promise<{
		success: boolean;
		epc?: string;
		format?: string;
		tagType?: string;
		pc?: string;
		mediaId?: string;
		secured?: boolean;
		message?: string;
	}> {
		try {
			const params = new URLSearchParams({
				mediaId,
				secured: secured.toString()
			});
			if (format) {
				params.append('format', format);
			}

			const response = await fetch(`${this.baseUrl}/initialize/${this.readerName}?${params}`, {
				method: 'POST'
			});

			const result = await response.json();
			return {
				success: result.success === true,
				epc: result.epc,
				format: result.format,
				tagType: result.tagType,
				pc: result.pc,
				mediaId: result.mediaId,
				secured: result.secured,
				message: result.message || result.error
			};
		} catch (error) {
			clientLogger.error('Failed to initialize item:', error);
			return {
				success: false,
				message: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	async edit(
		epc: string,
		mediaId: string
	): Promise<{
		success: boolean;
		mediaId?: string;
		oldEpc?: string;
		newEpc?: string;
		tagType?: string;
		message?: string;
	}> {
		try {
			const response = await fetch(
				`${this.baseUrl}/edit/${this.readerName}?epc=${encodeURIComponent(epc)}&mediaId=${encodeURIComponent(mediaId)}`,
				{ method: 'POST' }
			);

			const result = await response.json();
			return {
				success: result.success === true,
				mediaId: result.mediaId ?? mediaId,
				oldEpc: result.oldEpc ?? epc,
				newEpc: result.newEpc,
				tagType: result.tagType,
				message: result.message ?? result.error
			};
		} catch (error) {
			clientLogger.error('Failed to edit item:', error);
			return {
				success: false,
				mediaId,
				oldEpc: epc,
				message: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	async clear(epc: string): Promise<{
		success: boolean;
		newEpc?: string;
		oldEpc?: string;
		newPc?: string;
		tid?: string;
		message?: string;
	}> {
		try {
			const response = await fetch(
				`${this.baseUrl}/clear/${this.readerName}?epc=${encodeURIComponent(epc)}`,
				{ method: 'POST' }
			);

			const result = await response.json();
			return {
				success: result.success === true,
				newEpc: result.newEpc,
				oldEpc: result.oldEpc ?? epc,
				newPc: result.newPc,
				tid: result.tid,
				message: result.message ?? result.error
			};
		} catch (error) {
			clientLogger.error('Failed to clear item:', error);
			return {
				success: false,
				oldEpc: epc,
				message: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	async analyze(epc: string): Promise<AnalyzeResult> {
		try {
			const response = await fetch(
				`${this.baseUrl}/analyze/${this.readerName}?epc=${encodeURIComponent(epc)}`
			);

			const result = await response.json();
			const parsed = v.safeParse(AnalyzeResponseSchema, result);
			if (!parsed.success) {
				clientLogger.error('Invalid analyze response:', parsed.issues);
				return { success: false, epc, message: 'Analyze response validation failed' };
			}

			const output: AnalyzeResponse = parsed.output;
			if (!output.success) {
				return {
					success: false,
					epc: output.epc ?? epc,
					analysis: output.analysis,
					message: output.message ?? output.error
				};
			}

			return {
				success: true,
				epc: output.epc ?? epc,
				analysis: output.analysis,
				message: output.message ?? output.error
			};
		} catch (error) {
			clientLogger.error('Failed to analyze item:', error);
			return {
				success: false,
				epc,
				message: error instanceof Error ? error.message : 'Unknown error'
			};
		}
	}

	async isConnected(): Promise<boolean> {
		try {
			const status = await this.getStatus();
			return status.connected;
		} catch (error) {
			clientLogger.error('Failed to check connection:', error);
			return false;
		}
	}

	async getStatus(): Promise<{
		connected: boolean;
		mode?: string;
		model?: string;
		antennas?: number[];
		antennaMask?: string;
		notificationActive?: boolean;
		notificationPort?: number;
		connectionStatus?: string;
		power?: number;
	}> {
		try {
			const response = await fetch(`${this.baseUrl}/readers`);
			if (!response.ok) {
				return { connected: false };
			}

			const data = await response.json();
			const parsed = v.safeParse(ReadersResponseSchema, data);
			if (!parsed.success) {
				clientLogger.error('Invalid readers response:', parsed.issues);
				return { connected: false };
			}

			const reader = parsed.output.readers.find((r) => r.name === this.readerName);

			if (!reader) {
				return { connected: false };
			}

			const antennas = this.normalizeAntennas(reader.antennas);

			return {
				connected: reader.isConnected,
				mode: reader.mode,
				model: reader.mode,
				antennas,
				antennaMask: reader.antennaMask,
				notificationActive: reader.notificationActive,
				notificationPort: reader.notificationPort,
				connectionStatus: reader.connectionStatus,
				power: undefined
			};
		} catch (error) {
			clientLogger.error('Failed to get status:', error);
			return { connected: false };
		}
	}

	/**
	 * Get information about all available readers from the API
	 * This is a static utility method, not part of the RFIDReader interface
	 * @param baseUrl Base URL of the Feig API server (default: http://localhost:7070)
	 */
	static async getAllReaders(baseUrl: string = 'http://localhost:7070'): Promise<ReaderInfo[]> {
		const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
		try {
			const response = await fetch(`${normalizedBaseUrl}/readers`);
			if (!response.ok) {
				throw new Error(`Failed to fetch readers: ${response.statusText}`);
			}

			const data = await response.json();
			const parsed = v.safeParse(ReadersResponseSchema, data);
			if (!parsed.success) {
				clientLogger.error('Invalid readers response:', parsed.issues);
				throw new Error('Invalid response from readers endpoint');
			}

			return parsed.output.readers.map((reader: ReaderResponse) => ({
				name: reader.name,
				address: reader.address,
				port: reader.port,
				mode: reader.mode,
				antennas: FeigRFIDReader.normalizeAntennas(reader.antennas),
				antennaMask: reader.antennaMask ?? '',
				isConnected: reader.isConnected,
				connectionStatus: reader.connectionStatus ?? '',
				notificationActive: reader.notificationActive || false,
				notificationPort: reader.notificationPort
			}));
		} catch (error) {
			clientLogger.error('Failed to get readers:', error);
			throw error;
		}
	}

	// Helper methods
	private static normalizeAntennas(antennas: number | number[]): number[] {
		if (Array.isArray(antennas)) return antennas;
		if (typeof antennas === 'number') return [antennas];
		return [];
	}

	private normalizeAntennas(antennas: number | number[]): number[] {
		return FeigRFIDReader.normalizeAntennas(antennas);
	}

	private async isNotificationMode(): Promise<boolean> {
		if (this.eventSource) {
			return true;
		}

		try {
			const status = await this.getStatus();
			const mode = status.mode?.toLowerCase();
			return status.notificationActive === true || mode === 'notification';
		} catch {
			return false;
		}
	}

	private startSseMonitoring(): void {
		if (!browser || typeof window === 'undefined' || typeof EventSource === 'undefined') {
			this.startPollingFallback();
			return;
		}

		if (this.eventSource) {
			return;
		}

		const streamUrl = `${this.baseUrl}/notification/stream/${this.readerName}`;
		const source = new EventSource(streamUrl);
		this.eventSource = source;

		source.addEventListener('connected', () => {
			clientLogger.debug('Connected to Feig notification stream', {
				readerName: this.readerName
			});
		});

		source.addEventListener('tag', (event) => {
			this.handleSseTagEvent(event, 'tag');
		});

		source.addEventListener('tag_stable', (event) => {
			this.handleSseTagEvent(event, 'tag_stable');
		});

		source.addEventListener('tag_unstable', (event) => {
			this.handleSseTagEvent(event, 'tag_unstable');
		});

		source.addEventListener('tag_removed', (event) => {
			this.handleSseTagEvent(event, 'tag_removed');
		});

		source.addEventListener('identification', (event) => {
			clientLogger.debug('Feig identification event received', {
				readerName: this.readerName,
				data: (event as MessageEvent).data
			});
		});

		source.addEventListener('error', (event) => {
			clientLogger.warn('Feig notification stream error', {
				readerName: this.readerName,
				readyState: source.readyState,
				event
			});
		});
	}

	private startPollingFallback(): void {
		if (this.monitoringInterval) {
			return;
		}

		this.monitoringInterval = setInterval(async () => {
			try {
				const currentItems = await this.inventory();
				this.detectChanges(currentItems);
			} catch (error) {
				clientLogger.error('Monitoring error:', error);
			}
		}, 2000);
	}

	private stopAllMonitoringTransports(): void {
		if (this.eventSource) {
			this.eventSource.close();
			this.eventSource = undefined;
		}

		if (this.monitoringInterval) {
			clearInterval(this.monitoringInterval);
			this.monitoringInterval = undefined;
		}
	}

	private handleSseTagEvent(
		event: Event,
		sseType: 'tag' | 'tag_stable' | 'tag_unstable' | 'tag_removed'
	): void {
		const messageEvent = event as MessageEvent;
		if (!messageEvent.data) {
			return;
		}

		try {
			const parsedJson = JSON.parse(messageEvent.data);
			const parsed = v.safeParse(NotificationTagEventSchema, parsedJson);
			if (!parsed.success) {
				clientLogger.warn('Invalid Feig SSE tag payload', parsed.issues);
				return;
			}

			const item = this.convertNotificationToRFIDData(parsed.output);
			const previous = this.lastKnownItems.get(item.id);
			const mappedType = this.mapNotificationEventType(sseType, parsed.output.eventType);

			if (mappedType === 'removed') {
				this.lastKnownItems.delete(item.id);
				this.notifyCallbacks({ type: 'removed', item: previous ?? item });
				return;
			}

			this.lastKnownItems.set(item.id, item);

			if (mappedType === 'stable' || mappedType === 'unstable') {
				this.notifyCallbacks({ type: mappedType, item });
				return;
			}

			if (!previous) {
				this.notifyCallbacks({ type: 'added', item });
				return;
			}

			if (this.hasChanged(previous, item)) {
				this.notifyCallbacks({ type: 'updated', item });
			}
		} catch (error) {
			clientLogger.error('Failed to handle Feig SSE tag event:', error);
		}
	}

	private mapNotificationEventType(
		sseType: 'tag' | 'tag_stable' | 'tag_unstable' | 'tag_removed',
		payloadEventType?: string
	): 'added' | 'removed' | 'stable' | 'unstable' {
		const normalizedPayloadType = payloadEventType?.toUpperCase();

		if (sseType === 'tag_removed' || normalizedPayloadType === 'TAG_REMOVED') {
			return 'removed';
		}

		if (sseType === 'tag_stable' || normalizedPayloadType === 'TAG_STABLE') {
			return 'stable';
		}

		if (sseType === 'tag_unstable' || normalizedPayloadType === 'TAG_UNSTABLE') {
			return 'unstable';
		}

		return 'added';
	}

	private convertNotificationToRFIDData(event: NotificationTagEvent): RFIDData {
		const antennaRssi = event.rssiValues?.map((rssiValue) => ({
			antennaNumber: rssiValue.antennaNumber ?? rssiValue.antenna ?? 0,
			rssi: rssiValue.rssi
		}));

		const timestamp = this.parseNotificationTimestamp(event.timestamp ?? event.readerTimestamp);
		const previous = this.lastKnownItems.get(event.epc);

		return {
			id: event.epc,
			data: event.mediaId ?? previous?.data,
			mediaId: event.mediaId ?? previous?.mediaId,
			tagType: event.tagType ?? previous?.tagType,
			pc: event.pc ?? previous?.pc,
			rssi: this.calculateAverageRssi(antennaRssi),
			timestamp,
			secured: event.secured ?? previous?.secured,
			antennaRssi,
			stable: event.stable,
			seenCount: event.seenCount,
			presenceDurationMs: event.presenceDurationMs,
			bestRssi: event.bestRssi
		};
	}

	private parseNotificationTimestamp(timestamp?: string): Date {
		if (!timestamp) {
			return new Date();
		}

		const normalized = timestamp.replace(/\.(\d{3})\d+/, '.$1');
		const parsed = new Date(normalized);
		if (Number.isNaN(parsed.getTime())) {
			return new Date();
		}

		return parsed;
	}

	private convertToRFIDData(tags: InventoryTag[]): RFIDData[] {
		return tags.map((tag) => ({
			id: tag.epc,
			data: tag.mediaId,
			mediaId: tag.mediaId,
			tagType: tag.tagType,
			pc: tag.pc,
			rssi: this.calculateAverageRssi(tag.rssiValues),
			timestamp: new Date(),
			secured: tag.secured,
			antennaRssi: tag.rssiValues?.map((rssi) => ({
				antennaNumber: rssi.antennaNumber,
				rssi: rssi.rssi
			}))
		}));
	}

	private calculateAverageRssi(
		rssiValues?: Array<{ antennaNumber?: number; antenna?: number; rssi: number }>
	): number {
		if (!rssiValues || rssiValues.length === 0) return -50;

		const sum = rssiValues.reduce((acc, val) => acc + val.rssi, 0);
		return Math.round(sum / rssiValues.length);
	}

	private detectChanges(currentItems: RFIDData[]): void {
		const currentIds = new Set(currentItems.map((item) => item.id));
		const previousIds = new Set(this.lastKnownItems.keys());

		// Detect added items
		for (const item of currentItems) {
			if (!previousIds.has(item.id)) {
				this.notifyCallbacks({ type: 'added', item });
			} else {
				// Check for updates
				const previous = this.lastKnownItems.get(item.id);
				if (previous && this.hasChanged(previous, item)) {
					this.notifyCallbacks({ type: 'updated', item });
				}
			}
		}

		// Detect removed items
		for (const [id, item] of this.lastKnownItems.entries()) {
			if (!currentIds.has(id)) {
				this.notifyCallbacks({ type: 'removed', item });
			}
		}

		// Update last known items
		this.lastKnownItems.clear();
		for (const item of currentItems) {
			this.lastKnownItems.set(item.id, item);
		}
	}

	private hasChanged(previous: RFIDData, current: RFIDData): boolean {
		return (
			previous.secured !== current.secured ||
			previous.data !== current.data ||
			Math.abs((previous.rssi || 0) - (current.rssi || 0)) > 5
		);
	}

	private notifyCallbacks(event: {
		type: 'added' | 'removed' | 'updated' | 'stable' | 'unstable';
		item: RFIDData;
	}): void {
		this.callbacks.forEach((callback) => callback(event));
	}
}

// Factory function to create a Feig reader instance
export function createFeigReader(config: FeigReaderConfig): FeigRFIDReader {
	return new FeigRFIDReader(config);
}
