import type { LayoutServerLoad } from './$types';
import { getConfig } from '$lib/server/config';

export const load: LayoutServerLoad = async () => {
	const config = getConfig();
	const pageBackgrounds = config.theme?.page_backgrounds;

	return {
		themeCssVars: {
			'--bw-page-home-from': pageBackgrounds?.home?.from ?? '#2563eb',
			'--bw-page-home-to': pageBackgrounds?.home?.to ?? '#3730a3',
			'--bw-page-checkout-from': pageBackgrounds?.checkout?.from ?? 'var(--color-primary)',
			'--bw-page-checkout-to': pageBackgrounds?.checkout?.to ?? 'var(--color-secondary)',
			'--bw-page-gate-from': pageBackgrounds?.gate?.from ?? 'var(--color-primary)',
			'--bw-page-gate-to': pageBackgrounds?.gate?.to ?? 'var(--color-secondary)',
			'--bw-page-reader-from': pageBackgrounds?.reader?.from ?? 'var(--color-info)',
			'--bw-page-reader-to': pageBackgrounds?.reader?.to ?? 'var(--color-primary)',
			'--bw-page-tagging-from': pageBackgrounds?.tagging?.from ?? 'var(--color-info)',
			'--bw-page-tagging-to': pageBackgrounds?.tagging?.to ?? 'var(--color-primary)',
			'--bw-page-admin-from': pageBackgrounds?.admin?.from ?? 'var(--color-base-200)',
			'--bw-page-admin-to': pageBackgrounds?.admin?.to ?? 'var(--color-base-300)'
		}
	};
};
