<script lang="ts">
	import RFIDItem from '$lib/components/RFIDItem.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import CheckoutSummaryModal from '$lib/components/CheckoutSummaryModal.svelte';
	import { BookDown, Check, X } from '@lucide/svelte';
	import type { PageProps } from './$types';
	import { onDestroy, onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import type { SvelteComponent } from 'svelte';
	import { createReaderFromParams } from '$lib/stores/reader-selection';
	import type { RFIDData, RFIDReader } from '$lib/reader/interface';
	import { borrowItem, loginUser, logoutUser } from '$lib/lms/lms.remote';
	import type { LmsActionResult, MediaItem } from '$lib/lms/lms';
	import { getAuthUser, clearAuthUser, setAuthUser } from '$lib/stores/auth';
	import { goto, invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { clientLogger } from '$lib/client/logger';
	import {
		getCheckoutSession,
		startCheckoutSession,
		addSessionItem,
		clearCheckoutSession,
		getItemIdentity,
		type CheckoutSession,
		type SessionItem
	} from '$lib/stores/checkout-session';
	import { SvelteSet } from 'svelte/reactivity';
	import { m } from '$lib/paraglide/messages';
	import { createIdleCountdown, IDLE_TIMEOUT_SECONDS } from '$lib/client/idle-countdown';
	import placeBooksDefaultImage from '$lib/assets/place_book.png';

	let { data }: PageProps = $props();

	const needsLogin = $derived(data.requiresAuth || !data.account);
	const loginMode = $derived(data.loginMode ?? 'username_password');
	let showLoginModal = $derived(needsLogin);
	let showSummaryModal = $state(false);
	let countdownSeconds = $state(IDLE_TIMEOUT_SECONDS);
	//const countdownProgress = $derived(Math.round((countdownSeconds / IDLE_TIMEOUT_SECONDS) * 100));
	let currentSession: CheckoutSession | null = $state(null);
	let readerUnsubscribe: (() => void) | null = null;
	let readerInstance: RFIDReader | null = null;
	const missingReaderParams = $derived(
		!data.readerConfig.middlewareId || !data.readerConfig.readerId
	);
	const lmsType = $derived(data.lmsType ?? 'alma');
	const checkoutProfileId = $derived(
		data.checkoutProfileId ?? page.url.searchParams.get('checkout_profile_id')
	);
	const checkoutProfile = $derived(data.checkoutProfile ?? null);
	const checkoutProfileRequired = $derived(lmsType.toLowerCase() === 'alma');
	let readerError: string | null = $state(null);
	const readerWarning = $derived(
		readerError ??
			(missingReaderParams
				? 'Reader configuration is missing. Add middleware_id and reader_id to the URL.'
				: null)
	);
	const checkoutProfileWarning = $derived.by(() => {
		if (!checkoutProfileRequired) return null;
		if (!checkoutProfileId) {
			return 'Checkout profile is missing. Add checkout_profile_id to the URL.';
		}
		if (!checkoutProfile) {
			return `Checkout profile "${checkoutProfileId}" not found in config.`;
		}
		return null;
	});
	const workflowWarning = $derived(readerWarning ?? checkoutProfileWarning ?? null);
	const noMediaFoundImageUrl = $derived(
		data.checkoutConfig?.noMediaFoundImageUrl || placeBooksDefaultImage
	);

	const idleCountdown = createIdleCountdown({
		seconds: IDLE_TIMEOUT_SECONDS,
		onTick: (remainingSeconds) => {
			countdownSeconds = remainingSeconds;
		},
		onExpired: () => {
			handleIdleTimeout();
		}
	});

	type RFIDItemInstance = SvelteComponent & { refresh: () => Promise<void> };

	type ProcessedItem = {
		rfidData: RFIDData;
		mediaItem: MediaItem | null;
		mediaResolved: boolean;
		actionReady: boolean;
		status: 'checking' | 'lending' | 'success' | 'failed';
		message?: string;
		component?: RFIDItemInstance | null; // Reference to RFIDItem component
	};

	let processedItems: Array<ProcessedItem> = $state([]);
	let sessionInitialized = false;

	function startIdleCountdown() {
		idleCountdown.start();
	}

	function resetIdleCountdown() {
		if (showLoginModal || showSummaryModal) return;
		idleCountdown.reset();
	}

	function stopIdleCountdown() {
		idleCountdown.stop();
	}

	function dedupeSessionItems(items: SessionItem[]): SessionItem[] {
		const seen = new SvelteSet<string>();
		const unique: SessionItem[] = [];

		for (const item of items) {
			const identity = getItemIdentity(item.rfidData);
			if (seen.has(identity)) continue;
			seen.add(identity);
			unique.push(item);
		}

		return unique;
	}

	async function handleMediaItemLoaded(processed: ProcessedItem, mediaItem: MediaItem | null) {
		if (processed.status !== 'checking') return;

		processed.mediaResolved = true;
		processed.mediaItem = mediaItem;

		if (!processed.actionReady) {
			processed.message = 'Detected. Waiting for stable signal...';
			processedItems = [...processedItems];
			return;
		}

		await attemptBorrow(processed);
	}

	async function attemptBorrow(processed: ProcessedItem) {
		if (processed.status !== 'checking' || !processed.actionReady || !processed.mediaResolved) {
			return;
		}

		if (workflowWarning) {
			processed.status = 'failed';
			processed.message = workflowWarning ?? undefined;
			processedItems = [...processedItems];
			return;
		}

		const mediaItem = processed.mediaItem;

		if (!mediaItem) {
			processed.status = 'failed';
			processed.message = 'Item not found in library system';
			processedItems = [...processedItems];

			// Add to session
			addSessionItem({
				rfidData: processed.rfidData,
				mediaItem: null,
				timestamp: Date.now(),
				status: 'failed',
				message: processed.message
			});
			currentSession = getCheckoutSession();
			return;
		}

		// Try to lend the item
		processed.status = 'lending';
		processed.message = 'Processing...';
		processedItems = [...processedItems];

		let result: LmsActionResult | undefined;
		try {
			const context =
				checkoutProfileId && checkoutProfileRequired ? { checkoutProfileId } : undefined;
			result = await borrowItem({
				barcode: processed.rfidData.mediaId || processed.rfidData.id,
				context
			});
		} catch (error) {
			clientLogger.error({ err: error }, 'Borrow item call failed');
			result = { ok: false, reason: 'Unexpected error while borrowing item' };
		}

		if (result?.ok) {
			processed.status = 'success';
			processed.message = result.message ?? 'Successfully borrowed';
			// Refresh the RFIDItem to show updated status
			if (processed.component?.refresh) {
				await processed.component.refresh();
			}
			const itemForSession = result.item ?? mediaItem;
			processed.mediaItem = itemForSession ?? processed.mediaItem;

			if (readerInstance?.unsecure) {
				try {
					await readerInstance.unsecure(processed.rfidData.id);
				} catch (err) {
					clientLogger.error({ err }, 'Failed to unsecure item after borrow');
				}
			}

			// Add to session
			addSessionItem({
				rfidData: processed.rfidData,
				mediaItem: itemForSession,
				timestamp: Date.now(),
				status: 'success',
				message: processed.message
			});
		} else {
			processed.status = 'failed';
			const reason = result?.reason ?? 'Failed to borrow item';
			//const details = result?.errors?.length ? `: ${result.errors.join('; ')}` : '';
			processed.message = reason; // + details;

			// Add to session
			addSessionItem({
				rfidData: processed.rfidData,
				mediaItem,
				timestamp: Date.now(),
				status: 'failed',
				message: processed.message
			});
		}

		processedItems = [...processedItems];
		currentSession = getCheckoutSession();
	}

	function processItem(rfidData: RFIDData, actionReady: boolean) {
		const identity = getItemIdentity(rfidData);
		const existing = processedItems.find((p) => getItemIdentity(p.rfidData) === identity);

		if (existing) {
			existing.rfidData = rfidData;
			existing.actionReady = existing.actionReady || actionReady;
			if (existing.status === 'checking' && existing.actionReady && existing.mediaResolved) {
				void attemptBorrow(existing);
			}
			processedItems = [...processedItems];
			return;
		}

		resetIdleCountdown();

		// Add item with checking status
		const processed: ProcessedItem = {
			rfidData,
			mediaItem: null,
			mediaResolved: false,
			actionReady,
			status: 'checking',
			message: actionReady ? 'Preparing to borrow...' : 'Detected. Waiting for stable signal...'
		};
		processedItems = [processed, ...processedItems];
	}

	async function initSessionAndReader(activeUser: string) {
		// Initialize or restore session once
		if (!sessionInitialized) {
			let session = getCheckoutSession();
			if (!session || session.type !== 'borrow') {
				session = startCheckoutSession('borrow');
			}
			currentSession = session;
			sessionInitialized = true;

			if (session.items.length > 0 && processedItems.length === 0) {
				const uniqueItems = dedupeSessionItems(session.items);
				processedItems = uniqueItems.map((item) => ({
					rfidData: item.rfidData,
					mediaItem: item.mediaItem,
					mediaResolved: true,
					actionReady: true,
					status: item.status === 'success' ? 'success' : 'failed',
					message: item.message,
					component: null
				}));
			}
		}

		if (!activeUser) return;

		await loginUser({ user: activeUser });

		// Tear down any previous subscription before starting a new one
		if (readerUnsubscribe) {
			readerUnsubscribe();
			readerUnsubscribe = null;
		}

		const reader = createReaderFromParams(
			data.readerConfig.middlewareId,
			data.readerConfig.readerId,
			data.readerConfig.middlewareUrl,
			data.readerConfig.middlewareType
		);

		readerInstance = reader ?? null;

		if (!reader) {
			clientLogger.error(
				'No reader configured. Please configure a reader via URL params or admin page.'
			);
			readerError =
				'No reader configured. Add middleware_id and reader_id to the URL before borrowing.';
			return;
		}

		readerError = null;

		readerUnsubscribe = reader.startMonitoring((event) => {
			clientLogger.debug('Event type:', event.type);
			clientLogger.debug('Item:', event.item);

			if (event.type === 'added') {
				const actionReady =
					typeof event.item.stable === 'undefined' ? true : event.item.stable === true;
				processItem(event.item, actionReady);
				return;
			}

			if (event.type === 'stable') {
				clientLogger.info('Borrow became stable:', event.item.id);
				processItem(event.item, true);
			}
		});
	}

	onMount(async () => {
		clientLogger.debug('Page data:', data);

		const storedUser = getAuthUser();
		const activeUser = data.authUser || storedUser;

		if (!activeUser) {
			showLoginModal = true;
			return;
		}

		if (!storedUser && data.authUser) {
			setAuthUser(data.authUser);
		}

		await initSessionAndReader(activeUser);
		startIdleCountdown();
	});

	onDestroy(() => {
		stopIdleCountdown();
		if (readerUnsubscribe) {
			readerUnsubscribe();
			readerUnsubscribe = null;
		}
		readerInstance = null;
	});

	async function handleLoginSuccess() {
		showLoginModal = false;

		// Log in to LMS with stored user
		const authUser = getAuthUser();
		if (authUser) {
			await initSessionAndReader(authUser);
		}

		startIdleCountdown();

		// Reload the data to load account info
		invalidateAll();
	}

	function handleLogoutAndBack() {
		stopIdleCountdown();
		clearAuthUser();
		logoutUser();
		goto(`/checkout${page.url.search}`);
	}

	function handleDoneClick() {
		if (showSummaryModal) return;

		stopIdleCountdown();

		// Stop reader monitoring
		if (readerUnsubscribe) {
			readerUnsubscribe();
			readerUnsubscribe = null;
		}
		showSummaryModal = true;
	}

	function handleSummaryConfirm() {
		stopIdleCountdown();
		clearCheckoutSession();
		clearAuthUser();
		logoutUser();
		goto(`/checkout${page.url.search}`);
	}

	function handleIdleTimeout() {
		handleDoneClick();
	}
</script>

<svelte:window
	onpointerdown={resetIdleCountdown}
	onkeydown={resetIdleCountdown}
	onwheel={resetIdleCountdown}
	ontouchstart={resetIdleCountdown}
/>

{#if showLoginModal}
	{#if workflowWarning}
		<div class="mx-auto mb-4 alert max-w-4xl alert-warning shadow-lg">
			<div>
				<strong>{m.configuration_missing()}.</strong>
				{workflowWarning}
				{m.contact_staff()}.
			</div>
			<a
				class="btn btn-ghost btn-sm"
				href="?middleware_id=mock1&reader_id=MockReader1"
				onclick={(event) => {
					event.preventDefault();
					location.assign('?middleware_id=mock1&reader_id=MockReader1');
				}}
			>
				MOCK
			</a>
		</div>
	{/if}
	<LoginModal
		onSuccess={handleLoginSuccess}
		onCancel={handleLogoutAndBack}
		{loginMode}
		loginHelpImage={data.loginHelpImage}
	/>
{:else}
	<div class="app-page-bg-checkout min-h-screen p-8">
		<div class="mx-auto max-w-6xl">
			{#if workflowWarning}
				<div class="mb-6 alert alert-warning shadow-lg">
					<div>
						<strong>{m.configuration_missing()}.</strong>
						{workflowWarning}
						{m.contact_staff()}.
					</div>
					<a
						class="btn btn-ghost btn-sm"
						href="?middleware_id=mock1&reader_id=MockReader1"
						onclick={(event) => {
							event.preventDefault();
							location.assign('?middleware_id=mock1&reader_id=MockReader1');
						}}
					>
						MOCK
					</a>
				</div>
			{/if}
			<header
				class="mb-8 flex flex-col gap-4 rounded-2xl bg-base-100/10 p-6 shadow-lg backdrop-blur-sm md:flex-row md:items-center md:justify-between"
			>
				<div class="flex items-center gap-4">
					<div class="rounded-2xl bg-base-100/20 p-3 text-white shadow-lg">
						<BookDown class="h-8 w-8" />
					</div>
					<div class="text-white">
						<h1 class="text-4xl font-bold drop-shadow-lg">{m.borrow_label()}</h1>
						<p class="text-base opacity-90">
							{m.borrow_description()}{#if data.account}: {data.account.name}{/if}
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
						<progress class="progress w-full progress-primary" value={countdownProgress} max="100"
						></progress>
					</div>-->
					<div
						class="flex items-center justify-between gap-2 text-xs font-semibold tracking-wide uppercase"
					>
						<span>Timeout</span>
						<span>{countdownSeconds}s</span>
					</div>
					<button class="btn shadow-xl btn-lg btn-accent" onclick={handleDoneClick}>
						<Check />{m.i_am_done()}
					</button>
				</div>
			</header>

			<div class="mb-8">
				<div class="card bg-base-100 shadow-2xl">
					<div class="card-body p-0">
						<ul class="">
							<!--<li
								class="flex flex-row items-center justify-between menu-title px-6 py-4 text-base opacity-70"
							>
								<span class="text-lg">{m.items_to_borrow()}</span>
								<span class="badge badge-lg badge-primary">{processedItems.length}</span>
							</li>-->
							{#each processedItems as item (item.rfidData.id)}
								<li
									class="border-t border-base-200"
									in:fly={{ y: -10, duration: 160 }}
									out:fade={{ duration: 120 }}
									animate:flip={{ duration: 200 }}
								>
									<div
										class="flex flex-col gap-4 p-4 hover:bg-base-200 md:flex-row md:items-center"
									>
										<div class="flex-1 md:max-w-[75%] md:basis-3/4">
											<RFIDItem
												item={item.rfidData}
												showBadges={false}
												bind:this={item.component}
												onMediaItemLoaded={(mediaItem) => handleMediaItemLoaded(item, mediaItem)}
											/>
										</div>
										<div
											class="ml-0 flex items-center gap-2 md:ml-4 md:max-w-[25%] md:basis-1/4 md:justify-end"
										>
											{#if item.status === 'checking' || item.status === 'lending'}
												<div
													class="card w-full border border-base-300 bg-base-100 px-4 py-3 shadow-sm"
												>
													<div class="flex items-center gap-3">
														<span class="loading loading-md loading-spinner text-primary"></span>
														<span class="text-left text-base">{item.message}</span>
													</div>
												</div>
											{:else if item.status === 'success'}
												<div
													class="card w-full border border-success/40 bg-success/10 px-4 py-4 text-base text-success shadow-sm"
												>
													<div class="flex items-center gap-3">
														<Check />
														<span class="text-left">{item.message}</span>
													</div>
												</div>
											{:else if item.status === 'failed'}
												<div
													class="card w-full border border-error/40 bg-error/10 px-4 py-4 text-base text-error shadow-sm"
												>
													<div class="flex flex-col gap-2">
														<div class="flex items-center gap-2">
															<X />
															<span class="font-semibold">{m.error()}</span>
														</div>
														<span class="text-left wrap-break-word">{item.message}</span>
													</div>
												</div>
											{/if}
										</div>
									</div>
								</li>
							{:else}
								<li class="px-6 py-6 text-center">
									<div class="flex flex-col items-center gap-4">
										<div class="flex flex-col items-center gap-4">
											<p class="text-lg">{m.place_items_on_the_reader_to_begin()}</p>
										</div>
										<img
											src={noMediaFoundImageUrl}
											alt={m.place_items_on_the_reader_to_begin()}
											class="min-h-96 w-full max-w-xl rounded-2xl object-cover shadow-lg"
											loading="lazy"
										/>
									</div>
								</li>
							{/each}
						</ul>
					</div>
				</div>
			</div>
		</div>
	</div>

	{#if showSummaryModal && currentSession}
		<CheckoutSummaryModal session={currentSession} onConfirm={handleSummaryConfirm} />
	{/if}
{/if}
