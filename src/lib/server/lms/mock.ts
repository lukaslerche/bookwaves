import type {
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

function getMockReturnDirective(item: MediaItem): LmsReturnDirective {
	const location = item.location?.toLowerCase() ?? '';
	const author = item.author?.toLowerCase() ?? '';

	if (location.includes('children') || author.includes('rowling')) {
		return {
			binId: 'blue',
			label: 'Blue bin',
			color: 'blue',
			message: 'Place this item in the blue sorting bin',
			sortOrder: 2
		};
	}

	if (location.includes('fiction') || location.includes('fantasy')) {
		return {
			binId: 'red',
			label: 'Red bin',
			color: 'red',
			message: 'Place this item in the red sorting bin',
			sortOrder: 1
		};
	}

	return {
		binId: 'green',
		label: 'Green bin',
		color: 'green',
		message: 'Place this item in the green sorting bin',
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

		const borrowedItems = Array.from(mediaDatabase.values()).filter(
			(item) => item.status === 'borrowed'
		);
		return borrowedItems;
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
