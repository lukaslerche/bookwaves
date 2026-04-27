<script lang="ts">
	import LoginModal from '$lib/components/LoginModal.svelte';
	import type { PageProps } from './$types';
	import { page } from '$app/state';
	import { User, ShoppingCart, Package, Receipt } from '@lucide/svelte';
	import { onDestroy, onMount } from 'svelte';
	import { getAuthUser, clearAuthUser, setAuthUser } from '$lib/stores/auth';
	import { loginUser, logoutUser } from '$lib/lms/lms.remote';
	import { goto, invalidateAll } from '$app/navigation';
	import { m } from '$lib/paraglide/messages';
	import { createIdleCountdown, IDLE_TIMEOUT_SECONDS } from '$lib/client/idle-countdown';

	let { data }: PageProps = $props();

	const needsLogin = $derived(data.requiresAuth || !data.account);
	const loginMode = $derived(data.loginMode ?? 'username_password');
	let showLoginModal = $derived(needsLogin);
	let countdownSeconds = $state(IDLE_TIMEOUT_SECONDS);
	//const countdownProgress = $derived(Math.round((countdownSeconds / IDLE_TIMEOUT_SECONDS) * 100));

	// Get current query string to preserve reader config
	let queryString = $derived(page.url.search);

	const idleCountdown = createIdleCountdown({
		seconds: IDLE_TIMEOUT_SECONDS,
		onTick: (remainingSeconds) => {
			countdownSeconds = remainingSeconds;
		},
		onExpired: () => {
			handleIdleTimeout();
		}
	});

	function startIdleCountdown() {
		idleCountdown.start();
	}

	function resetIdleCountdown() {
		if (showLoginModal) return;
		idleCountdown.reset();
	}

	function stopIdleCountdown() {
		idleCountdown.stop();
	}

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
		startIdleCountdown();
	});

	onDestroy(() => {
		stopIdleCountdown();
	});

	async function handleLoginSuccess() {
		showLoginModal = false;

		// Log in to LMS with stored user
		const authUser = getAuthUser();
		if (authUser) {
			await loginUser({ user: authUser });
		}

		startIdleCountdown();

		// Reload the page to load account data
		invalidateAll();
	}

	function handleLogoutAndBack() {
		stopIdleCountdown();
		clearAuthUser();
		logoutUser();
		goto(`/checkout${queryString}`);
	}

	function handleIdleTimeout() {
		handleLogoutAndBack();
	}

	function formatDate(value?: string): string {
		if (!value) return '-';
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? '-' : date.toLocaleDateString();
	}

	function formatLoanDuration(from?: string, to?: string): string {
		return `${formatDate(from)} - ${formatDate(to)}`;
	}

	function formatTitleAuthorYear(item: {
		title?: string;
		author?: string;
		year?: string;
		date?: string;
	}): string {
		const title = item.title?.trim() || '-';
		const author = item.author?.trim();
		const year = item.year?.trim() || item.date?.trim();

		if (author && year) return `${title} - ${author} (${year})`;
		if (author) return `${title} - ${author}`;
		if (year) return `${title} (${year})`;
		return title;
	}

	function formatMoney(balance: number, currency?: string): string {
		return new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency: currency || 'EUR'
		}).format(balance);
	}

	function formatFeeComment(comment?: string): string {
		if (!comment?.trim()) return '-';
		if (comment.startsWith('Date generated:')) {
			return comment.split('Profile:')[1] || comment.split('Profile/s:')[1] || comment;
		}
		return comment;
	}

	function hasFeeMedium(fee: { title?: string; author?: string; year?: string }): boolean {
		return Boolean(fee.title?.trim() || fee.author?.trim() || fee.year?.trim());
	}

	const feesTotal = $derived(data.fees.reduce((sum, fee) => sum + fee.balance, 0));
	const feesCurrency = $derived(data.fees[0]?.currency ?? 'EUR');
</script>

<svelte:window
	onpointerdown={resetIdleCountdown}
	onkeydown={resetIdleCountdown}
	onwheel={resetIdleCountdown}
	ontouchstart={resetIdleCountdown}
/>

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
						<h1 class="text-4xl font-bold drop-shadow-lg">{m.account_label()}</h1>
						<p class="text-base opacity-90">
							{m.account_description()}{#if data.account}: {data.account.name}{/if}
						</p>
					</div>
				</div>
				<div class="flex flex-col gap-3 sm:flex-row sm:items-center md:ml-auto">
					<!--<div
						class="w-full rounded-xl bg-base-100/80 px-3 py-2 text-base-content shadow-lg sm:w-52"
					>
						<div
							class="mb-1 flex items-center justify-between text-xs font-semibold tracking-wide uppercase"
						>
							<span>Timeout</span>
							<span>{countdownSeconds}s</span>
						</div>
						<progress class="progress w-full progress-warning" value={countdownProgress} max="100"
						></progress>
					</div>-->
					<div
						class="flex items-center justify-between gap-2 text-xs font-semibold tracking-wide uppercase"
					>
						<span>Timeout</span>
						<span>{countdownSeconds}s</span>
					</div>
					<button onclick={handleLogoutAndBack} class="btn shadow-xl btn-lg btn-accent">
						← {m.logout()}
					</button>
				</div>
			</header>

			{#if data.account}
				<div class="mt-6 mb-8">
					<div role="tablist" class="tabs-lift tabs w-full tabs-lg">
						<label class="tab">
							<input type="radio" name="account_tabs" checked />
							<User class="me-2 size-4" />
							{m.loans()} ({data.loans.length})
						</label>
						<div class="tab-content border-base-300 bg-base-100 p-6">
							<h2 class="text-2xl font-semibold">{m.current_loans()}</h2>
							{#if data.loans.length === 0}
								<p class="mt-4 text-center text-sm opacity-70">{m.no_current_loans()}.</p>
							{:else}
								<ul class="mt-4 space-y-2">
									{#each data.loans as loan (loan.barcode)}
										<li class="rounded-lg bg-base-100 p-3">
											<div class="grid gap-x-4 gap-y-1 text-sm md:grid-cols-2">
												<p class="font-semibold md:col-span-2">{formatTitleAuthorYear(loan)}</p>
												<p class="opacity-70">{m.shelfmark()}: {loan.shelfmark ?? '-'}</p>
												<p class="opacity-70">
													{m.return_to()}: {loan.returnLibrary ?? loan.library ?? '-'}
												</p>
												<p class="opacity-70 md:col-span-2">
													{m.loan_duration()}: {formatLoanDuration(loan.loanDate, loan.dueDate)}
												</p>
											</div>
										</li>
									{/each}
								</ul>
							{/if}
						</div>

						<label class="tab">
							<input type="radio" name="account_tabs" />
							<ShoppingCart class="me-2 size-4" />
							{m.orders()} ({data.requests.length})
						</label>
						<div class="tab-content border-base-300 bg-base-100 p-6">
							<h2 class="text-2xl font-semibold">{m.recent_orders()}</h2>
							{#if data.requests.length === 0}
								<p class="mt-4 text-center text-sm opacity-70">{m.no_current_loans()}.</p>
							{:else}
								<ul class="mt-4 space-y-2">
									{#each data.requests as request (request.requestId)}
										<li class="rounded-lg bg-base-100 p-3">
											<div class="grid gap-x-4 gap-y-1 text-sm md:grid-cols-2">
												<p class="font-semibold md:col-span-2">{formatTitleAuthorYear(request)}</p>
												<p class="opacity-70">{m.pickup_from()}: {request.pickupLocation ?? '-'}</p>
												<p class="opacity-70">
													{m.requested_on()}: {formatDate(request.requestDate)}
												</p>
												<p class="opacity-70">
													{m.queue_position()}: {request.placeInQueue ?? '-'}
												</p>
												<p class="opacity-70">{m.status()}: {request.requestStatus ?? '-'}</p>
												<p class="opacity-70 md:col-span-2">
													{m.request_type()}: {request.requestSubType ?? request.requestType ?? '-'}
												</p>
											</div>
										</li>
									{/each}
								</ul>
							{/if}
						</div>

						<label class="tab">
							<input type="radio" name="account_tabs" />
							<Package class="me-2 size-4" />
							{m.pickups()} ({data.pickups.length})
						</label>
						<div class="tab-content border-base-300 bg-base-100 p-6">
							<h2 class="text-2xl font-semibold">{m.pickup_windows()}</h2>
							{#if data.pickups.length === 0}
								<p class="mt-4 text-center text-sm opacity-70">{m.no_current_loans()}.</p>
							{:else}
								<ul class="mt-4 space-y-2">
									{#each data.pickups as pickup (pickup.requestId)}
										<li class="rounded-lg bg-base-100 p-3">
											<div class="grid gap-x-4 gap-y-1 text-sm md:grid-cols-2">
												<p class="font-semibold md:col-span-2">{formatTitleAuthorYear(pickup)}</p>
												<p class="opacity-70">{m.shelfmark()}: {pickup.shelfmark ?? '-'}</p>
												<p class="opacity-70">
													{m.pickup_until()}: {formatDate(pickup.expiryDate)}
												</p>
												<p class="opacity-70">{m.pickup_from()}: {pickup.pickupLocation ?? '-'}</p>
												<p class="opacity-70">
													{m.request_type()}: {pickup.requestSubType ?? pickup.requestType ?? '-'}
												</p>
											</div>
										</li>
									{/each}
								</ul>
							{/if}
						</div>

						<label class="tab">
							<input type="radio" name="account_tabs" />
							<Receipt class="me-2 size-4" />
							{m.fees()} ({formatMoney(feesTotal, feesCurrency)})
						</label>
						<div class="tab-content border-base-300 bg-base-100 p-6">
							<h2 class="text-2xl font-semibold">{m.fees()} & {m.balances()}</h2>
							{#if data.fees.length === 0}
								<p class="mt-4 text-center text-sm opacity-70">{m.no_fees()}.</p>
							{:else}
								<ul class="mt-4 space-y-2">
									{#each data.fees as fee (fee.type + '-' + fee.balance + '-' + (fee.creationTime ?? ''))}
										<li class="rounded-lg bg-base-100 p-3">
											<div class="grid gap-x-4 gap-y-1 text-sm md:grid-cols-[1fr_auto]">
												<p class="font-semibold">{fee.type}</p>
												<p class="text-right font-medium opacity-80">
													{formatMoney(fee.balance, fee.currency)}
												</p>
												<p class="opacity-70">{m.date()}: {formatDate(fee.creationTime)}</p>
												<p class="text-right opacity-70">{m.status()}: {fee.status ?? '-'}</p>
												{#if hasFeeMedium(fee)}
													<p class="opacity-70 md:col-span-2">
														{m.medium()}: {formatTitleAuthorYear(fee)}
													</p>
												{/if}
												<p class="opacity-70 md:col-span-2">
													{m.comment()}: {formatFeeComment(fee.comment)}
												</p>
											</div>
										</li>
									{/each}
								</ul>
							{/if}
						</div>
					</div>
				</div>
			{:else}
				<div class="mb-12 rounded-xl bg-base-100/20 p-6 text-center text-white/80">
					<p>{m.please_sign_in()}.</p>
				</div>
			{/if}
		</div>
	</div>
{/if}
