<script lang="ts">
	import RFIDItem from '$lib/components/RFIDItem.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import LoginModal from '$lib/components/LoginModal.svelte';
	import CheckoutSummaryModal from '$lib/components/CheckoutSummaryModal.svelte';
	import { BookOpen, Check, X } from '@lucide/svelte';
	import type { PageProps } from './$types';
	import { onDestroy, onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import type { SvelteComponent } from 'svelte';
	import { createReaderFromParams } from '$lib/stores/reader-selection';
	import type { RFIDData, RFIDReader } from '$lib/reader/interface';
	import { borrowItem, loginUser, logoutUser } from '$lib/lms/lms.remote';
	import type { LmsActionResult, MediaItem } from '$lib/lms/lms';
	import Account from '$lib/components/Account.svelte';
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

	let { data }: PageProps = $props();

	const needsLogin = $derived(data.requiresAuth || !data.account);
	const loginMode = $derived(data.loginMode ?? 'username_password');
	let showLoginModal = $derived(needsLogin);
	let showSummaryModal = $state(false);
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

	type RFIDItemInstance = SvelteComponent & { refresh: () => Promise<void> };

	type ProcessedItem = {
		rfidData: RFIDData;
		mediaItem: MediaItem | null;
		status: 'checking' | 'lending' | 'success' | 'failed';
		message?: string;
		component?: RFIDItemInstance | null; // Reference to RFIDItem component
	};

	let processedItems: Array<ProcessedItem> = $state([]);
	let sessionInitialized = false;

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

		if (workflowWarning) {
			processed.status = 'failed';
			processed.message = workflowWarning ?? undefined;
			processedItems = [...processedItems];
			return;
		}

		// Store media item reference
		processed.mediaItem = mediaItem;

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

	function processItem(rfidData: RFIDData) {
		const identity = getItemIdentity(rfidData);

		// Check if already processed using stable identity (ignores secured flips)
		if (processedItems.some((p) => getItemIdentity(p.rfidData) === identity)) {
			return;
		}

		// Add item with checking status
		const processed: ProcessedItem = {
			rfidData,
			mediaItem: null,
			status: 'checking',
			message: 'Preparing to borrow...'
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
				clientLogger.info('New item detected:', event.item.id);
				processItem(event.item);
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
	});

	onDestroy(() => {
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

		// Reload the data to load account info
		invalidateAll();
	}

	function handleLogoutAndBack() {
		clearAuthUser();
		logoutUser();
		goto(`/checkout${page.url.search}`);
	}

	function handleDoneClick() {
		// Stop reader monitoring
		if (readerUnsubscribe) {
			readerUnsubscribe();
			readerUnsubscribe = null;
		}
		showSummaryModal = true;
	}

	function handleSummaryConfirm() {
		clearCheckoutSession();
		clearAuthUser();
		logoutUser();
		goto(`/checkout${page.url.search}`);
	}
</script>

{#if showLoginModal}
	{#if workflowWarning}
		<div class="mx-auto mb-4 alert max-w-4xl alert-warning shadow-lg">
			<div>
				<strong>Configuration missing.</strong>
				{workflowWarning} Contact IT/library staff.
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
	<LoginModal onSuccess={handleLoginSuccess} onCancel={handleLogoutAndBack} {loginMode} />
{:else}
	<div class="min-h-screen bg-linear-to-br from-primary to-secondary p-8">
		<div class="mx-auto max-w-6xl">
			{#if workflowWarning}
				<div class="mb-6 alert alert-warning shadow-lg">
					<div>
						<strong>Configuration missing.</strong>
						{workflowWarning} Contact IT/library staff.
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
				class="mb-8 flex flex-row items-center justify-between rounded-2xl bg-base-100/10 p-6 shadow-lg backdrop-blur-sm"
			>
				<h1 class="text-4xl font-bold text-white drop-shadow-lg">Borrow Books</h1>
				{#if data.account}
					<div class="rounded-xl bg-base-100 p-4 shadow-lg">
						<Account
							name={data.account.name}
							fees={data.account.fees}
							borrowedCount={data.account.loans}
						/>
					</div>
				{/if}
			</header>

			<div class="mb-8">
				<div class="card bg-base-100 shadow-2xl">
					<div class="card-body p-0">
						<ul class="">
							<li
								class="flex flex-row items-center justify-between menu-title px-6 py-4 text-base opacity-70"
							>
								<span class="text-lg">Items to Borrow</span>
								<span class="badge badge-lg badge-primary">{processedItems.length}</span>
							</li>
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
															<span class="font-semibold">Error</span>
														</div>
														<span class="text-left wrap-break-word">{item.message}</span>
													</div>
												</div>
											{/if}
										</div>
									</div>
								</li>
							{:else}
								<li class="px-6 py-12 text-center">
									<EmptyState
										icon={BookOpen}
										title="Ready to Borrow"
										description="Place items on the reader to begin"
									/>
								</li>
							{/each}
						</ul>
					</div>
				</div>
			</div>

			<div class="flex justify-center gap-4">
				<button class="btn px-10 text-xl shadow-xl btn-lg btn-accent" onclick={handleDoneClick}>
					Done & Logout →
				</button>
			</div>
		</div>
	</div>

	{#if showSummaryModal && currentSession}
		<CheckoutSummaryModal session={currentSession} onConfirm={handleSummaryConfirm} />
	{/if}
{/if}
