<script lang="ts">
	import Account from '$lib/components/Account.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import type { PageProps } from './$types';
	import { page } from '$app/state';
	import { User, ShoppingCart, Package, Receipt } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { getAuthUser, clearAuthUser, setAuthUser } from '$lib/stores/auth';
	import { loginUser, logoutUser } from '$lib/lms/lms.remote';
	import { goto, invalidateAll } from '$app/navigation';

	let { data }: PageProps = $props();

	const mockOrders = [
		{ id: 'ORD-1037', title: 'Hold shelf request', status: 'Processing', total: 'USD 6.50' },
		{ id: 'ORD-1031', title: 'Interlibrary loan', status: 'Shipped', total: 'USD 12.00' },
		{ id: 'ORD-1024', title: 'Special collection scan', status: 'Completed', total: 'USD 4.00' }
	];

	const mockPickups = [
		{ code: 'PU-7712', location: 'Main Branch', window: 'Feb 6, 9:00-18:00' },
		{ code: 'PU-7698', location: 'West Annex', window: 'Feb 7, 10:00-16:00' }
	];

	const mockFees = [
		{ type: 'Overdue', amount: 'USD 2.75', status: 'Unpaid' },
		{ type: 'Replacement', amount: 'USD 18.00', status: 'Pending' },
		{ type: 'Processing', amount: 'USD 1.25', status: 'Paid' }
	];

	const needsLogin = $derived(data.requiresAuth || !data.account);
	const loginMode = $derived(data.loginMode ?? 'username_password');
	let showLoginModal = $derived(needsLogin);

	// Get current query string to preserve reader config
	let queryString = $derived(page.url.search);

	onMount(async () => {
		// Check if user is authenticated
		const storedUser = getAuthUser();
		const activeUser = data.authUser || storedUser;

		if (!activeUser) {
			showLoginModal = true;
			return;
		}

		if (!storedUser && data.authUser) {
			setAuthUser(data.authUser);
		}

		// Log in to LMS with stored user
		await loginUser({ user: activeUser });
	});

	async function handleLoginSuccess() {
		showLoginModal = false;

		// Log in to LMS with stored user
		const authUser = getAuthUser();
		if (authUser) {
			await loginUser({ user: authUser });
		}

		// Reload the page to load account data
		invalidateAll();
	}

	function handleLogoutAndBack() {
		clearAuthUser();
		logoutUser();
		goto(`/checkout${queryString}`);
	}
</script>

{#if showLoginModal}
	<LoginModal onSuccess={handleLoginSuccess} onCancel={handleLogoutAndBack} {loginMode} />
{:else}
	<div class="app-page-bg-checkout min-h-screen p-8">
		<div class="mx-auto max-w-6xl">
			<header
				class="mb-8 flex flex-col gap-4 rounded-2xl bg-base-100/10 p-6 shadow-lg backdrop-blur-sm md:flex-row md:items-center md:justify-between"
			>
				<div class="flex items-center gap-4">
					<div class="rounded-2xl bg-base-100/20 p-3 text-white shadow-lg">
						<User class="h-8 w-8" />
					</div>
					<div class="text-white">
						<h1 class="text-4xl font-bold drop-shadow-lg">Your Account</h1>
						<p class="text-base opacity-90">Overview of your loans and fees</p>
					</div>
				</div>
				<div class="md:ml-auto">
					<button onclick={handleLogoutAndBack} class="btn shadow-xl btn-lg btn-accent">
						← Logout & Back
					</button>
				</div>
			</header>

			{#if data.account}
				<div class="mb-8">
					<Account
						name={data.account.name}
						fees={data.account.fees}
						borrowedCount={data.account.loans}
					/>
					<div class="mt-6">
						<div role="tablist" class="tabs-lift tabs w-full tabs-lg">
							<label
								class="tab [--tab-bg:color-mix(in_oklab,var(--color-primary),white_15%)] [--tab-border-color:var(--color-primary)]"
							>
								<input type="radio" name="account_tabs" checked />
								<User class="me-2 size-4" />
								Loans
							</label>
							<div
								class="tab-content border-base-300 bg-(--tab-bg) p-6 [--tab-bg:color-mix(in_oklab,var(--color-primary),white_15%)]"
							>
								<h2 class="text-2xl font-semibold">Current Loans</h2>
								{#if data.loans.length === 0}
									<p class="mt-4 text-center text-sm opacity-70">You have no current loans.</p>
								{:else}
									<ul class="mt-4 space-y-2">
										{#each data.loans as loan}
											<li
												class="flex flex-row items-center justify-between rounded-lg bg-base-100 p-4"
											>
												<div>
													<p class="font-semibold">{loan.title}</p>
													<p class="text-sm opacity-70">Barcode: {loan.barcode}</p>
												</div>
												<!-- TODO<div class="text-sm opacity-70">Due: NOT IMPLEMENTED</div>-->
											</li>
										{/each}
									</ul>
								{/if}
							</div>

							<label
								class="tab [--tab-bg:color-mix(in_oklab,var(--color-secondary),white_15%)] [--tab-border-color:var(--color-secondary)]"
							>
								<input type="radio" name="account_tabs" />
								<ShoppingCart class="me-2 size-4" />
								Orders
							</label>
							<div
								class="tab-content border-base-300 bg-(--tab-bg) p-6 [--tab-bg:color-mix(in_oklab,var(--color-secondary),white_15%)]"
							>
								<h2 class="text-2xl font-semibold">Recent Orders</h2>
								<ul class="mt-4 space-y-2">
									{#each mockOrders as order}
										<li class="rounded-lg bg-base-100 p-4">
											<div class="flex items-center justify-between">
												<p class="font-semibold">{order.title}</p>
												<p class="text-sm opacity-70">{order.id}</p>
											</div>
											<div class="mt-1 flex items-center justify-between text-sm opacity-70">
												<span>Status: {order.status}</span>
												<span>Total: {order.total}</span>
											</div>
										</li>
									{/each}
								</ul>
							</div>

							<label
								class="tab [--tab-bg:color-mix(in_oklab,var(--color-accent),white_15%)] [--tab-border-color:var(--color-accent)]"
							>
								<input type="radio" name="account_tabs" />
								<Package class="me-2 size-4" />
								Pickups
							</label>
							<div
								class="tab-content border-base-300 bg-(--tab-bg) p-6 [--tab-bg:color-mix(in_oklab,var(--color-accent),white_15%)]"
							>
								<h2 class="text-2xl font-semibold">Pickup Windows</h2>
								<ul class="mt-4 space-y-2">
									{#each mockPickups as pickup}
										<li class="rounded-lg bg-base-100 p-4">
											<div class="flex items-center justify-between">
												<p class="font-semibold">{pickup.location}</p>
												<p class="text-sm opacity-70">{pickup.code}</p>
											</div>
											<p class="mt-1 text-sm opacity-70">Window: {pickup.window}</p>
										</li>
									{/each}
								</ul>
							</div>

							<label
								class="tab [--tab-bg:color-mix(in_oklab,#f59e0b,white_15%)] [--tab-border-color:#f59e0b]"
							>
								<input type="radio" name="account_tabs" />
								<Receipt class="me-2 size-4" />
								Fees
							</label>
							<div
								class="tab-content border-base-300 bg-(--tab-bg) p-6 [--tab-bg:color-mix(in_oklab,#f59e0b,white_15%)]"
							>
								<h2 class="text-2xl font-semibold">Fees & Balances</h2>
								<ul class="mt-4 space-y-2">
									{#each mockFees as fee}
										<li class="flex items-center justify-between rounded-lg bg-base-100 p-4">
											<div>
												<p class="font-semibold">{fee.type}</p>
												<p class="text-sm opacity-70">Status: {fee.status}</p>
											</div>
											<p class="text-sm opacity-70">{fee.amount}</p>
										</li>
									{/each}
								</ul>
							</div>
						</div>
					</div>
				</div>
			{:else}
				<div class="mb-12 rounded-xl bg-base-100/20 p-6 text-center text-white/80">
					<p>Please sign in to view your account details.</p>
				</div>
			{/if}
		</div>
	</div>
{/if}
