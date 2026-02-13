<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import NavigationCard from '$lib/components/NavigationCard.svelte';
	import { BookOpen, List, User, Undo2 } from '@lucide/svelte';
	import { page } from '$app/state';

	// Get current query string to preserve reader config
	let queryString = $derived(page.url.search);
</script>

<div class="app-page-bg-checkout flex min-h-full flex-col items-center justify-center p-8">
	<PageHeader title="Self-Checkout" subtitle="Please select an option to continue" showLogo />

	<nav class="grid w-full max-w-6xl grid-cols-1 gap-8 lg:grid-cols-4">
		<NavigationCard
			href="/checkout/borrow{queryString}"
			title="Borrow"
			description="Check out books"
			icon={BookOpen}
			iconColor="primary"
			size="large"
		/>

		<NavigationCard
			href="/checkout/return{queryString}"
			title="Return"
			description="Return borrowed books"
			icon={Undo2}
			iconColor="primary"
			size="large"
		/>

		<NavigationCard
			href="/checkout/list{queryString}"
			title="List"
			description="View status of books on the device"
			icon={List}
			iconColor="primary"
			size="large"
		/>

		<NavigationCard
			href="/checkout/account{queryString}"
			title="Account"
			description="View your library account"
			icon={User}
			iconColor="primary"
			size="large"
		/>
	</nav>
</div>
