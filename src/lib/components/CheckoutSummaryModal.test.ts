import { render } from 'svelte/server';
import { expect, it } from 'vitest';
import type { SessionItem } from '#lib/stores/checkout-session.js';
import CheckoutSummaryModal from './CheckoutSummaryModal.svelte';

const yellow = {
	binId: 'main',
	label: 'Yellow cart',
	message: 'Place the book on the yellow cart.',
	image: '/branding/return-carts/buchwagen-gelb.png'
};
const red = {
	binId: 'reserved',
	label: 'Red cart',
	message: 'Place the book on the red cart.',
	image: '/branding/return-carts/buchwagen-rot.png'
};

function item(status: SessionItem['status'], id: string): SessionItem {
	return {
		rfidData: { id, timestamp: new Date(0) },
		mediaItem: { barcode: id, title: `Book ${id}` },
		timestamp: 0,
		status,
		message: status === 'success' ? 'Returned' : 'Could not return'
	};
}

it('shows the configured summary timeout', async () => {
	const { body } = await render(CheckoutSummaryModal, {
		props: {
			idleTimeoutSeconds: 90,
			onConfirm: () => {},
			session: { type: 'borrow', startedAt: 0, items: [] }
		}
	});

	expect(body).toContain('90s');
});

it('shows the full cart directive only for successful returns, even with an RFID warning', async () => {
	const { body } = await render(CheckoutSummaryModal, {
		props: {
			idleTimeoutSeconds: 60,
			onConfirm: () => {},
			session: {
				type: 'return',
				startedAt: 0,
				items: [
					{ ...item('success', '1'), directive: yellow, rfidWarning: 'RFID update pending' },
					{ ...item('failed', '2'), directive: red }
				]
			}
		}
	});

	expect(body).toContain(yellow.label);
	expect(body).toContain(yellow.message);
	expect(body).toContain(`src="${yellow.image}"`);
	expect(body).toContain('RFID update pending');
	expect(body).toContain('Could not return');
	expect(body).not.toContain(red.label);
	expect(body).not.toContain(red.image);
});
