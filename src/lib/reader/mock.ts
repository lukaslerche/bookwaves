import type {
	RFIDReader,
	RFIDData,
	RFIDEventCallback,
	RFIDEvent,
	ReaderInfo,
	AnalyzeResult
} from './interface';

export type MockReaderMode = 'auto' | 'manual';

type ManualItemOptions = {
	/** Override RSSI for the inserted tag */
	rssi?: number;
	/** Override security flag */
	secured?: boolean;
	/** Optional custom payload */
	data?: string;
	/** Optional media ID when creating custom tags */
	mediaId?: string;
	/** Optional tag type */
	tagType?: string;
};

// Pool of all possible RFID items that could be detected
const rfidItemPool: RFIDData[] = [
	{
		id: 'RFID001',
		data: 'Book: The Great Gatsby',
		rssi: -45,
		timestamp: new Date(),
		secured: true
	},
	{ id: 'RFID002', data: 'Book: 1984', rssi: -52, timestamp: new Date(), secured: false },
	{
		id: 'RFID003',
		data: 'Book: Das gelbe Rechenbuch',
		rssi: -48,
		timestamp: new Date(),
		secured: true
	},
	{
		id: 'RFID004',
		data: 'Book: To Kill a Mockingbird',
		rssi: -55,
		timestamp: new Date(),
		secured: true
	},
	{
		id: 'RFID005',
		data: 'Book: Pride and Prejudice',
		rssi: -43,
		timestamp: new Date(),
		secured: true
	},
	{
		id: 'RFID006',
		data: 'Book: The Catcher in the Rye',
		rssi: -50,
		timestamp: new Date(),
		secured: true
	},
	{ id: 'RFID007', data: 'Book: Harry Potter', rssi: -47, timestamp: new Date(), secured: false },
	{ id: 'RFID008', data: 'Book: The Hobbit', rssi: -58, timestamp: new Date(), secured: true },
	{ id: 'RFID009', data: 'Book: Brave New World', rssi: -46, timestamp: new Date(), secured: true },
	{
		id: 'RFID010',
		data: 'Book: The Lord of the Rings',
		rssi: -51,
		timestamp: new Date(),
		secured: false
	}
	/*{
		id: '50000055199',
		data: 'HTML für Dummies',
		rssi: -51,
		timestamp: new Date(),
		secured: false
	},
	{
		id: '53178487',
		data: 'Taschenbuch Grundschule',
		rssi: -55,
		timestamp: new Date(),
		secured: false
	}*/
];

export class MockRFIDReader implements RFIDReader {
	private items: Map<string, RFIDData> = new Map();
	private callbacks: Set<RFIDEventCallback> = new Set();
	private simulationInterval?: NodeJS.Timeout;
	private mode: MockReaderMode = 'auto';
	private readonly maxItemsOnReader = 5;

	constructor() {}

	async inventory(): Promise<RFIDData[]> {
		await this.delay(100);

		if (this.mode === 'auto') {
			// Kick off simulation even when consumers only call inventory()
			this.startSimulationLoop(this.items.size === 0);
		}

		return Array.from(this.items.values());
	}

	startMonitoring(callback: RFIDEventCallback): () => void {
		this.callbacks.add(callback);

		// Immediately tell the new subscriber what is already on the reader
		this.items.forEach((item) => callback({ type: 'added', item }));

		// Simulate random item additions/removals

		if (this.mode === 'auto') {
			this.startSimulationLoop(this.items.size === 0);
		}

		// Return unsubscribe function
		return () => {
			this.callbacks.delete(callback);
			if (this.callbacks.size === 0) {
				this.stopSimulation();
			}
		};
	}

	async stopMonitoring(): Promise<void> {
		if (this.simulationInterval) {
			clearInterval(this.simulationInterval);
			this.simulationInterval = undefined;
		}
		this.callbacks.clear();
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
		await this.delay(200);

		const item = this.items.get(epc);
		if (!item)
			return {
				success: false,
				mediaId,
				oldEpc: epc,
				message: 'Tag not found'
			};

		item.data = `Book: Media ${mediaId}`;
		item.mediaId = mediaId;
		item.timestamp = new Date();
		this.notifyCallbacks({ type: 'updated', item });
		return {
			success: true,
			mediaId,
			oldEpc: epc,
			newEpc: epc,
			tagType: item.tagType,
			message: 'Tag updated successfully'
		};
	}

	async secure(epc: string): Promise<{
		success: boolean;
		epc?: string;
		tagType?: string;
		message?: string;
		secured?: boolean;
	}> {
		await this.delay(150);

		const item = this.items.get(epc);
		if (!item)
			return {
				success: false,
				epc,
				message: 'Tag not found'
			};

		item.secured = true;
		item.timestamp = new Date();
		this.notifyCallbacks({ type: 'updated', item });
		return {
			success: true,
			epc,
			tagType: item.tagType,
			message: 'Tag secured successfully (mock)',
			secured: true
		};
	}

	async unsecure(epc: string): Promise<{
		success: boolean;
		epc?: string;
		tagType?: string;
		message?: string;
		secured?: boolean;
	}> {
		await this.delay(150);

		const item = this.items.get(epc);
		if (!item)
			return {
				success: false,
				epc,
				message: 'Tag not found'
			};

		item.secured = false;
		item.timestamp = new Date();
		this.notifyCallbacks({ type: 'updated', item });
		return {
			success: true,
			epc,
			tagType: item.tagType,
			message: 'Tag unsecured successfully (mock)',
			secured: false
		};
	}

	async kill(epc: string): Promise<boolean> {
		await this.delay(300);

		const item = this.items.get(epc);
		if (!item) return false;

		this.items.delete(epc);
		this.notifyCallbacks({ type: 'removed', item });
		return true;
	}

	async read(epc: string): Promise<RFIDData | null> {
		await this.delay(100);
		return this.items.get(epc) || null;
	}

	async isConnected(): Promise<boolean> {
		await this.delay(50);
		return true; // Mock reader is always "connected"
	}

	getMode(): MockReaderMode {
		return this.mode;
	}

	setMode(mode: MockReaderMode): MockReaderMode {
		if (this.mode === mode) return this.mode;
		this.mode = mode;

		if (mode === 'manual') {
			this.stopSimulation();
		} else if (this.callbacks.size > 0) {
			this.startSimulationLoop(this.items.size === 0);
		}

		return this.mode;
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
		await this.delay(50);
		return {
			connected: true,
			mode: 'host',
			model: 'Mock RFID Reader v1.0',
			antennas: [1, 2, 3, 4],
			antennaMask: '0x0F',
			notificationActive: false,
			notificationPort: undefined,
			connectionStatus: 'connected',
			power: 30
		};
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
		await this.delay(300);

		const newEpc = `E${mediaId.padStart(23, '0')}`;
		const tagFormat = format || 'DE290';
		const newItem: RFIDData = {
			id: newEpc,
			data: `Book: Media ${mediaId}`,
			rssi: -45,
			timestamp: new Date(),
			secured,
			tagType: tagFormat,
			mediaId,
			pc: '3000'
		};

		this.items.set(newEpc, newItem);
		this.notifyCallbacks({ type: 'added', item: newItem });

		return {
			success: true,
			epc: newEpc,
			format: tagFormat,
			tagType: tagFormat,
			pc: '3000',
			mediaId,
			secured,
			message: 'Tag initialized successfully'
		};
	}

	async clear(epc: string): Promise<{
		success: boolean;
		newEpc?: string;
		oldEpc?: string;
		newPc?: string;
		tid?: string;
		message?: string;
	}> {
		await this.delay(300);

		const item = this.items.get(epc);
		if (!item)
			return {
				success: false,
				oldEpc: epc,
				message: 'Tag not found'
			};

		const tidEpc = `TID${Math.random().toString(36).substring(2, 15).toUpperCase()}`;
		this.items.delete(epc);

		const clearedItem: RFIDData = {
			...item,
			id: tidEpc,
			data: undefined,
			mediaId: undefined,
			secured: false,
			timestamp: new Date()
		};

		this.items.set(tidEpc, clearedItem);
		this.notifyCallbacks({ type: 'removed', item });
		this.notifyCallbacks({ type: 'added', item: clearedItem });

		return {
			success: true,
			newEpc: tidEpc,
			oldEpc: epc,
			newPc: '3000',
			tid: tidEpc,
			message: 'Tag cleared successfully'
		};
	}

	async analyze(epc: string): Promise<AnalyzeResult> {
		await this.delay(150);

		const item = this.items.get(epc);
		if (!item)
			return {
				success: false,
				epc,
				message: 'Tag not found'
			};

		return {
			success: true,
			epc,
			analysis: {
				tagType: item.tagType || 'DE290',
				mediaId: item.mediaId,
				epcBank: {
					readSuccess: true,
					pcValue: '0x4000',
					epcLengthInWords: 8,
					epcLengthInBytes: 16,
					matches: true
				},
				tidBank: {
					readSuccess: true,
					tidHex: 'E200001234567890ABCD',
					lengthBytes: 12
				},
				reservedBank: {
					readableWithAuth: true,
					passwordsMatch: true,
					matches: true,
					passwordProtectionConfigured: true,
					passwordProtectionRequired: true
				},
				lockStatus: {
					reservedBank: 'UNLOCKED',
					reservedBankStatus: 'Readable'
				},
				securityAssessment: {
					properlySecured: true,
					passwordCorrect: true,
					issues: []
				}
			}
		};
	}

	/**
	 * Get mock reader information (simulates /readers endpoint)
	 * This is a static utility method for testing, not part of the RFIDReader interface
	 */
	static async getAllReaders(): Promise<ReaderInfo[]> {
		// Return mock reader data
		return [
			{
				name: 'MockReader1',
				address: '192.168.1.100',
				port: 10001,
				mode: 'host',
				antennas: [1, 2, 3, 4],
				antennaMask: '0x0F',
				isConnected: true,
				connectionStatus: 'connected',
				notificationActive: false
			},
			{
				name: 'MockReader2',
				address: '192.168.1.101',
				port: 10002,
				mode: 'host',
				antennas: [1, 2],
				antennaMask: '0x03',
				isConnected: true,
				connectionStatus: 'connected',
				notificationActive: false
			}
		];
	}

	// Helper methods
	private notifyCallbacks(event: RFIDEvent): void {
		this.callbacks.forEach((callback) => callback(event));
	}

	private startSimulationLoop(prime: boolean = false): void {
		if (this.mode !== 'auto') return;
		if (prime) {
			this.simulateItemChanges(true);
		}
		if (this.simulationInterval) return;
		this.simulationInterval = setInterval(() => {
			this.simulateItemChanges();
		}, 3000);
	}

	private stopSimulation(): void {
		if (this.simulationInterval) {
			clearInterval(this.simulationInterval);
			this.simulationInterval = undefined;
		}
	}

	private simulateItemChanges(forceAdd: boolean = false): void {
		const presentKeys = this.getPresentItemKeys();
		const availableItems = this.getAvailableItems();
		const capacityLeft = Math.max(0, this.maxItemsOnReader - presentKeys.length);

		if (forceAdd || (presentKeys.length === 0 && availableItems.length > 0)) {
			this.addRandomItems(this.chooseAddCount(availableItems.length, capacityLeft));
			return;
		}

		const roll = Math.random();

		if (roll < 0.45 && availableItems.length > 0 && capacityLeft > 0) {
			this.addRandomItems(this.chooseAddCount(availableItems.length, capacityLeft));
			return;
		}

		if (roll < 0.8 && presentKeys.length > 0) {
			this.updateRandomItem(presentKeys);
			return;
		}

		if (presentKeys.length > 0) {
			this.removeRandomItem(presentKeys);
		}
	}

	private addRandomItems(count: number): void {
		if (count <= 0) return;
		const available = this.getAvailableItems();
		if (available.length === 0) return;
		const room = Math.max(0, this.maxItemsOnReader - this.items.size);
		if (room === 0) return;
		const finalCount = Math.min(count, room);

		const shuffled = [...available].sort(() => Math.random() - 0.5);
		const toAdd = shuffled.slice(0, finalCount);

		toAdd.forEach((item) => {
			const itemCopy: RFIDData = {
				...item,
				rssi: this.randomRssi(),
				timestamp: new Date(),
				secured: item.secured
			};
			this.items.set(itemCopy.id, itemCopy);
			this.notifyCallbacks({ type: 'added', item: itemCopy });
		});
	}

	private removeRandomItem(presentKeys: string[]): void {
		if (presentKeys.length === 0) return;
		const removeKey = presentKeys[Math.floor(Math.random() * presentKeys.length)];
		const removedItem = this.items.get(removeKey);
		if (!removedItem) return;
		this.items.delete(removeKey);
		this.notifyCallbacks({ type: 'removed', item: removedItem });
	}

	private updateRandomItem(presentKeys: string[]): void {
		if (presentKeys.length === 0) return;
		const updateKey = presentKeys[Math.floor(Math.random() * presentKeys.length)];
		const item = this.items.get(updateKey);
		if (!item) return;
		item.rssi = this.randomRssi(item.rssi);
		item.timestamp = new Date();
		this.notifyCallbacks({ type: 'updated', item: { ...item } });
	}

	private getPresentItemKeys(): string[] {
		return Array.from(this.items.keys());
	}

	private getAvailableItems(): RFIDData[] {
		return rfidItemPool.filter((item) => !this.items.has(item.id));
	}

	private chooseAddCount(maxAvailable: number, capacityLeft: number): number {
		if (maxAvailable <= 0 || capacityLeft <= 0) return 0;
		const wantsMultiple = Math.random() < 0.25;
		const count = wantsMultiple ? 1 + Math.floor(Math.random() * 2) : 1;
		return Math.min(count, maxAvailable, capacityLeft);
	}

	private randomRssi(base?: number): number {
		if (typeof base === 'number') {
			const delta = Math.floor(Math.random() * 12) - 6; // small drift to simulate movement
			return Math.max(-75, Math.min(-30, base + delta));
		}
		return -40 - Math.floor(Math.random() * 25);
	}

	private clampRssi(rssi?: number): number {
		const fallback = -55;
		if (typeof rssi !== 'number' || Number.isNaN(rssi)) return fallback;
		return Math.max(-80, Math.min(-25, rssi));
	}

	private cloneItem(base: RFIDData, overrides: Partial<RFIDData> = {}): RFIDData {
		return {
			...base,
			...overrides,
			timestamp: new Date(),
			rssi: this.clampRssi(overrides.rssi ?? base.rssi)
		};
	}

	/** Get a snapshot of items currently on the mock reader */
	getCurrentItems(): RFIDData[] {
		return Array.from(this.items.values()).map((item) => ({ ...item }));
	}

	/** Return items that are not on the reader yet and can be added */
	getAddableItems(): RFIDData[] {
		return this.getAvailableItems().map((item) => this.cloneItem(item));
	}

	addItemFromPool(itemId: string, options?: ManualItemOptions): RFIDData | null {
		const template = rfidItemPool.find((item) => item.id === itemId);
		if (!template) return null;
		return this.insertManualItem(template, options);
	}

	addCustomItem(id: string, label?: string, options?: ManualItemOptions): RFIDData {
		const base: RFIDData = {
			id,
			data: label ?? `Custom tag ${id}`,
			rssi: options?.rssi ?? -55,
			secured: options?.secured ?? false,
			timestamp: new Date(),
			mediaId: options?.mediaId,
			tagType: options?.tagType ?? 'CUSTOM'
		};

		return this.insertManualItem(base, options, true)!;
	}

	updateItemRssi(id: string, rssi: number): boolean {
		const item = this.items.get(id);
		if (!item) return false;
		item.rssi = this.clampRssi(rssi);
		item.timestamp = new Date();
		this.notifyCallbacks({ type: 'updated', item: { ...item } });
		return true;
	}

	removeItem(id: string): boolean {
		const existing = this.items.get(id);
		if (!existing) return false;
		this.items.delete(id);
		this.notifyCallbacks({ type: 'removed', item: existing });
		return true;
	}

	private insertManualItem(
		template: RFIDData,
		options?: ManualItemOptions,
		allowReplace: boolean = false
	): RFIDData | null {
		if (this.items.has(template.id) && !allowReplace) {
			return this.items.get(template.id) ?? null;
		}

		const item = this.cloneItem(template, {
			rssi: options?.rssi ?? template.rssi,
			secured: options?.secured ?? template.secured,
			data: options?.data ?? template.data,
			mediaId: options?.mediaId ?? template.mediaId,
			tagType: options?.tagType ?? template.tagType
		});

		this.items.set(item.id, item);
		this.notifyCallbacks({ type: 'added', item });
		return item;
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

export const mockRFIDReader = new MockRFIDReader();

/**
 * Get all mock readers (for testing/development)
 */
// The static getAllReaders() covers discovery; no extra wrapper needed.
