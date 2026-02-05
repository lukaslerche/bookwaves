<script lang="ts">
	import Account from '$lib/components/Account.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import type { PageProps } from './$types';
	import { page } from '$app/state';
	import { User } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import { getAuthUser, clearAuthUser, setAuthUser } from '$lib/stores/auth';
	import { loginUser, logoutUser } from '$lib/lms/lms.remote';
	import { goto, invalidateAll } from '$app/navigation';

	let { data }: PageProps = $props();

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
	<div class="min-h-screen bg-linear-to-br from-primary to-secondary p-8">
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
					<!-- a list of loans -->
					<div class="card mt-6 bg-base-100 shadow-lg">
						<div class="card-body">
							<h2 class="card-title text-2xl">Current Loans</h2>
							{#if data.loans.length === 0}
								<p class="mt-4 text-center text-sm opacity-70">You have no current loans.</p>
							{:else}
								<ul class="mt-4 space-y-2">
									{#each data.loans as loan}
										<li
											class="flex flex-row items-center justify-between rounded-lg bg-base-200 p-4"
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
