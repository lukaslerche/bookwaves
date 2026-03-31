import type {
	LmsFee,
	LmsPickup,
	LmsRequest,
	LibraryManagementSystem,
	LmsActionResult,
	LmsReturnDirective,
	MediaItem
} from '../../lms/lms';

// Mock database of media items
const mediaDatabase: Map<string, MediaItem> = new Map([
	[
		'RFID001',
		{
			barcode: 'RFID001',
			title: 'The Great Gatsby',
			author: 'F. Scott Fitzgerald',
			edition: '1st',
			place: 'New York',
			publisher: 'Scribner',
			date: '1925',
			cover: 'https://picsum.dev/120/180?seed=RFID001',
			status: 'available',
			library: 'Central Library',
			location: 'Fiction Stacks',
			shelfmark: 'FIC FIT'
		}
	],
	[
		'RFID002',
		{
			barcode: 'RFID002',
			title: '1984',
			author: 'George Orwell',
			edition: '1st',
			place: 'London',
			publisher: 'Secker & Warburg',
			date: '1949',
			cover: 'https://picsum.dev/120/180?seed=RFID002',
			status: 'borrowed',
			library: 'East Branch',
			location: 'Fiction',
			shelfmark: 'FIC ORW'
		}
	],
	[
		'RFID003',
		{
			barcode: 'RFID003',
			title: 'Das gelbe Rechenbuch',
			author: 'Peter Furlan',
			edition: '2. Auflage',
			place: 'Berlin',
			publisher: 'Schulverlag',
			date: '2013',
			cover: 'https://picsum.dev/120/180?seed=RFID003',
			status: 'borrowed',
			library: 'Central Library',
			location: 'Kinder',
			shelfmark: 'J 510 FUR'
		}
	],
	[
		'RFID004',
		{
			barcode: 'RFID004',
			title: 'To Kill a Mockingbird',
			author: 'Harper Lee',
			edition: '1st',
			place: 'Philadelphia',
			publisher: 'J.B. Lippincott & Co.',
			date: '1960',
			cover: 'https://picsum.dev/120/180?seed=RFID004',
			status: 'available',
			library: 'Central Library',
			location: 'Fiction Stacks',
			shelfmark: 'FIC LEE'
		}
	],
	[
		'RFID005',
		{
			barcode: 'RFID005',
			title: 'Pride and Prejudice',
			author: 'Jane Austen',
			edition: 'Penguin Classics',
			place: 'London',
			publisher: 'Penguin',
			date: '1813',
			cover: 'https://picsum.dev/120/180?seed=RFID005',
			status: 'reserved',
			library: 'West Branch',
			location: 'Classics',
			shelfmark: 'CLA AUS'
		}
	],
	[
		'RFID006',
		{
			barcode: 'RFID006',
			title: 'The Catcher in the Rye',
			author: 'J.D. Salinger',
			edition: '1st',
			place: 'Boston',
			publisher: 'Little, Brown and Company',
			date: '1951',
			cover: 'https://picsum.dev/120/180?seed=RFID006',
			status: 'available',
			library: 'Central Library',
			location: 'Fiction',
			shelfmark: 'FIC SAL'
		}
	],
	[
		'RFID007',
		{
			barcode: 'RFID007',
			title: "Harry Potter and the Philosopher's Stone",
			author: 'J.K. Rowling',
			edition: '1st',
			place: 'London',
			publisher: 'Bloomsbury',
			date: '1997',
			cover: 'https://picsum.dev/120/180?seed=RFID007',
			status: 'borrowed',
			library: 'Children’s Library',
			location: 'Fantasy',
			shelfmark: 'J FIC ROW'
		}
	],
	[
		'RFID008',
		{
			barcode: 'RFID008',
			title: 'The Hobbit',
			author: 'J.R.R. Tolkien',
			edition: 'Revised',
			place: 'London',
			publisher: 'Allen & Unwin',
			date: '1937',
			cover: 'https://picsum.dev/120/180?seed=RFID008',
			status: 'available',
			library: 'East Branch',
			location: 'Fantasy',
			shelfmark: 'FIC TOL'
		}
	],
	[
		'RFID009',
		{
			barcode: 'RFID009',
			title: 'Brave New World',
			author: 'Aldous Huxley',
			edition: 'Modern Classics',
			place: 'London',
			publisher: 'Chatto & Windus',
			date: '1932',
			cover: 'https://picsum.dev/120/180?seed=RFID009',
			status: 'available',
			library: 'Central Library',
			location: 'Fiction',
			shelfmark: 'FIC HUX'
		}
	],
	[
		'RFID010',
		{
			barcode: 'RFID010',
			title: 'The Lord of the Rings',
			author: 'J.R.R. Tolkien',
			edition: '1st',
			place: 'London',
			publisher: 'Allen & Unwin',
			date: '1954',
			cover: 'https://picsum.dev/120/180?seed=RFID010',
			status: 'borrowed',
			library: 'Central Library',
			location: 'Fantasy',
			shelfmark: 'FIC TOL'
		}
	]
]);

let currentUser: string | null = null;

const mockRequests: LmsRequest[] = [
	{
		requestId: 'REQ-1037',
		title: 'Hold shelf request',
		fullTitle: 'Hold shelf request',
		author: 'Ursula K. Le Guin',
		year: '1969',
		shelfmark: 'SF LEG 1969',
		requestType: 'HOLD',
		requestSubType: 'Physical Item',
		pickupLocation: 'Main Branch',
		requestStatus: 'IN_PROCESS',
		placeInQueue: 2,
		requestDate: '2026-03-22T09:00:00.000Z',
		manualDescription: '2025'
	},
	{
		requestId: 'REQ-1031',
		title: 'Interlibrary loan',
		fullTitle: 'Interlibrary loan',
		author: 'N.K. Jemisin',
		year: '2015',
		shelfmark: 'SF JEM 2015',
		requestType: 'PATRON_PHYSICAL',
		requestSubType: 'Fernleihe',
		pickupLocation: 'West Annex',
		requestStatus: 'IN_PROCESS',
		placeInQueue: 1,
		requestDate: '2026-03-20T10:00:00.000Z'
	},
	{
		requestId: 'REQ-1024',
		title: 'Special collection scan',
		fullTitle: 'Special collection scan',
		author: 'Aby Warburg',
		year: '1928',
		requestType: 'DIGITIZATION',
		requestSubType: 'Digitization',
		pickupLocation: 'DIGITIZATION',
		requestStatus: 'ON_HOLD_SHELF',
		requestDate: '2026-03-18T11:00:00.000Z',
		expiryDate: '2026-04-04T18:00:00.000Z',
		shelfmark: 'SC 904.2 ART'
	}
];

const mockFees: LmsFee[] = [
	{
		type: 'Overdue',
		balance: 2.75,
		currency: 'USD',
		status: 'Unpaid',
		title: 'The Left Hand of Darkness',
		author: 'Ursula K. Le Guin',
		year: '1969',
		creationTime: '2026-03-01T10:00:00.000Z'
	},
	{
		type: 'Replacement',
		balance: 18,
		currency: 'USD',
		status: 'Pending',
		title: 'Replacement cost',
		comment: 'Lost media replacement pending at circulation desk',
		creationTime: '2026-02-25T09:30:00.000Z'
	},
	{
		type: 'Processing',
		balance: 1.25,
		currency: 'USD',
		status: 'Paid',
		title: 'Processing fee',
		creationTime: '2026-02-10T13:15:00.000Z'
	}
];

function getMockReturnDirective(item: MediaItem): LmsReturnDirective {
	const location = item.location?.toLowerCase() ?? '';
	const author = item.author?.toLowerCase() ?? '';

	if (location.includes('children') || author.includes('rowling')) {
		return {
			binId: 'blue',
			label: 'Blue shelf',
			color: 'blue',
			message: 'Place this item in the blue sorting shelf',
			sortOrder: 2
		};
	}

	if (location.includes('fiction') || location.includes('fantasy')) {
		return {
			binId: 'red',
			label: 'Red shelf',
			color: 'red',
			message: 'Place this item in the red sorting shelf',
			sortOrder: 1
		};
	}

	return {
		binId: 'yellow',
		label: 'Yellow shelf',
		color: 'yellow',
		message: 'Place this item in the yellow sorting shelf',
		sortOrder: 3
	};
}

export const mockLMS: LibraryManagementSystem = {
	async loginUser(user: string /*, password?: string*/): Promise<boolean> {
		// Accept any username, password is optional
		if (user) {
			currentUser = user;
			return true;
		}
		return false;
	},
	async getAccount(): Promise<{ name: string; fees: number; loans: number }> {
		const borrowed = Array.from(mediaDatabase.values())
			.filter((item) => item.status === 'borrowed')
			.map((item) => `${item.title} | ${item.date}`);

		return {
			name: currentUser || 'Mock User',
			fees: 42.69,
			loans: borrowed.length
		};
	},
	async getLoans(): Promise<MediaItem[]> {
		if (!currentUser) {
			return [];
		}

		const borrowedItems = Array.from(mediaDatabase.values())
			.filter((item) => item.status === 'borrowed')
			.map((item, index) => ({
				...item,
				year: item.date,
				loanDate: `2026-03-${String(index + 1).padStart(2, '0')}T09:00:00.000Z`,
				dueDate: `2026-04-${String(index + 1).padStart(2, '0')}T17:00:00.000Z`,
				returnLibrary: item.library
			}));
		return borrowedItems;
	},
	async getRequests(): Promise<LmsRequest[]> {
		if (!currentUser) {
			return [];
		}

		return mockRequests
			.filter((request) => request.requestStatus !== 'ON_HOLD_SHELF')
			.toSorted((a, b) => (a.requestDate ?? '').localeCompare(b.requestDate ?? ''));
	},
	async getPickups(): Promise<LmsPickup[]> {
		if (!currentUser) {
			return [];
		}

		return mockRequests
			.filter((request) => request.requestStatus === 'ON_HOLD_SHELF')
			.toSorted((a, b) => (a.expiryDate ?? '').localeCompare(b.expiryDate ?? ''));
	},
	async getFees(): Promise<LmsFee[]> {
		if (!currentUser) {
			return [];
		}

		return mockFees.toSorted((a, b) => (a.creationTime ?? '').localeCompare(b.creationTime ?? ''));
	},
	async logoutUser(): Promise<boolean> {
		currentUser = null;
		return true;
	},
	async getItem(barcode: string): Promise<MediaItem | null> {
		await new Promise((resolve) => setTimeout(resolve, 100)); // Simulate network delay
		const item = mediaDatabase.get(barcode);
		if (!item) return null;
		return { ...item, returnDirective: getMockReturnDirective(item) };
	},
	async borrowItem(barcode: string): Promise<LmsActionResult> {
		await new Promise((resolve) => setTimeout(resolve, 200)); // Simulate network delay
		const item = mediaDatabase.get(barcode);

		if (!item) {
			return { ok: false, reason: 'Item not found' };
		}

		if (item.status !== 'available') {
			return {
				ok: false,
				reason: 'Item is not available',
				errors: [item.status ?? 'unknown status']
			};
		}

		item.status = 'borrowed';

		return {
			ok: true,
			item: { ...item, returnDirective: getMockReturnDirective(item) },
			message: 'Successfully borrowed'
		};
	},
	async returnItem(barcode: string): Promise<LmsActionResult> {
		await new Promise((resolve) => setTimeout(resolve, 200)); // Simulate network delay
		const item = mediaDatabase.get(barcode);

		if (!item) {
			return { ok: false, reason: 'Item not found' };
		}

		if (item.status !== 'borrowed') {
			return {
				ok: false,
				reason: 'Item is not currently borrowed',
				errors: [item.status ?? 'unknown status']
			};
		}

		item.status = 'available';
		const directive = getMockReturnDirective(item);

		return {
			ok: true,
			item: { ...item, returnDirective: directive },
			message: 'Successfully returned',
			directive
		};
	},

	async getHealth(): Promise<{ result: boolean; reason?: string }> {
		return { result: true };
		//return { result: false, reason: 'Mock LMS unhealthy for testing' };
	}
};
