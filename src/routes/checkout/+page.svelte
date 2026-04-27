<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import NavigationCard from '$lib/components/NavigationCard.svelte';
	import { BookDown, BookUp, User, BookSearch } from '@lucide/svelte';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';

	// Get current query string to preserve reader config
	let queryString = $derived(page.url.search);
	let checkoutIconThemeStyle = $derived(
		[
			'--bw-checkout-icon-borrow: color-mix(in oklab, var(--bw-page-checkout-to) 85%, var(--bw-page-checkout-from))',
			'--bw-checkout-icon-return: color-mix(in oklab, var(--bw-page-checkout-to) 65%, var(--bw-page-checkout-from))',
			'--bw-checkout-icon-list: color-mix(in oklab, var(--bw-page-checkout-to) 40%, var(--bw-page-checkout-from))',
			'--bw-checkout-icon-account: color-mix(in oklab, var(--bw-page-checkout-from) 85%, var(--bw-page-checkout-to))'
		].join('; ')
	);
</script>

<div class="app-page-bg-checkout flex min-h-full flex-col items-center justify-center p-8">
	<PageHeader title={m.checkout_label()} showLogo />

	<nav
		class="grid w-full max-w-6xl grid-cols-1 gap-8 lg:grid-cols-4"
		style={checkoutIconThemeStyle}
	>
		<NavigationCard
			href="/checkout/borrow{queryString}"
			title={m.borrow_label()}
			icon={BookDown}
			iconColorValue="var(--bw-checkout-icon-borrow)"
			size="large"
		/>

		<NavigationCard
			href="/checkout/return{queryString}"
			title={m.return_label()}
			icon={BookUp}
			iconColorValue="var(--bw-checkout-icon-return)"
			size="large"
		/>

		<NavigationCard
			href="/checkout/account{queryString}"
			title={m.account_label()}
			icon={User}
			iconColorValue="var(--bw-checkout-icon-account)"
			size="large"
		/>

		<NavigationCard
			href="/checkout/list{queryString}"
			title={m.list_label()}
			icon={BookSearch}
			iconColorValue="var(--bw-checkout-icon-list)"
			size="large"
		/>
	</nav>
</div>
