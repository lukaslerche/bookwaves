<script lang="ts">
	import RFIDItem from '$lib/components/RFIDItem.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import CheckoutSummaryModal from '$lib/components/CheckoutSummaryModal.svelte';
	import { Check, RotateCcw, Undo2, X } from '@lucide/svelte';
	import type { PageProps } from './$types';
	import { onDestroy, onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import type { SvelteComponent } from 'svelte';
	import { createReaderFromParams } from '$lib/stores/reader-selection';
	import type { RFIDData, RFIDReader } from '$lib/reader/interface';
	import { returnItem } from '$lib/lms/lms.remote';
	import type { LmsActionResult, LmsReturnDirective, MediaItem } from '$lib/lms/lms';
	import { goto } from '$app/navigation';
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
		directive?: LmsReturnDirective | null;
		status: 'checking' | 'returning' | 'success' | 'failed';
		message?: string;
		component?: RFIDItemInstance | null; // Reference to RFIDItem component
	};

	let processedItems: Array<ProcessedItem> = $state([]);

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

	function getDirectiveBadgeClass(color?: string) {
		switch (color) {
			case 'red':
				return 'badge-error';
			case 'green':
				return 'badge-success';
			case 'blue':
				return 'badge-info';
			case 'yellow':
				return 'badge-warning';
			default:
				return 'badge-neutral';
		}
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
		processed.directive = mediaItem?.returnDirective ?? processed.directive ?? null;

		if (!mediaItem) {
			processed.status = 'failed';
			processed.message = 'Item not found in library system';
			processedItems = [...processedItems];

			// Add to session
			addSessionItem({
				rfidData: processed.rfidData,
				mediaItem: null,
				directive: null,
				timestamp: Date.now(),
				status: 'failed',
				message: processed.message
			});
			currentSession = getCheckoutSession();
			return;
		}

		// Try to return the item
		processed.status = 'returning';
		processed.message = 'Processing...';
		processedItems = [...processedItems];

		let result: LmsActionResult | undefined;
		try {
			const context =
				checkoutProfileId && checkoutProfileRequired ? { checkoutProfileId } : undefined;
			result = await returnItem({
				barcode: processed.rfidData.mediaId || processed.rfidData.id,
				context
			});
		} catch (error) {
			clientLogger.error({ err: error }, 'Return item call failed');
			result = { ok: false, reason: 'Unexpected error while returning item' };
		}

		if (result?.ok) {
			processed.status = 'success';
			processed.message = result.message ?? 'Successfully returned';
			processed.directive =
				result.directive ?? processed.directive ?? mediaItem?.returnDirective ?? null;
			// Refresh the RFIDItem to show updated status
			if (processed.component?.refresh) {
				await processed.component.refresh();
			}
			const itemForSession = result.item ?? mediaItem;
			processed.mediaItem = itemForSession ?? processed.mediaItem;

			if (readerInstance?.secure) {
				try {
					await readerInstance.secure(processed.rfidData.id);
				} catch (err) {
					clientLogger.error({ err }, 'Failed to secure item after return');
				}
			}

			// Add to session
			addSessionItem({
				rfidData: processed.rfidData,
				mediaItem: itemForSession,
				directive: processed.directive ?? null,
				timestamp: Date.now(),
				status: 'success',
				message: processed.message
			});
		} else {
			processed.status = 'failed';
			const reason = result?.reason ?? 'Failed to return item';
			//const details = result?.errors?.length ? `: ${result.errors.join('; ')}` : '';
			processed.message = reason; // + details;

			// Add to session
			addSessionItem({
				rfidData: processed.rfidData,
				mediaItem,
				directive: processed.directive ?? null,
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
			message: 'Preparing to return...'
		};
		processedItems = [processed, ...processedItems];
	}

	onMount(async () => {
		clientLogger.debug('Page data:', data);

		// Initialize or restore session
		let session = getCheckoutSession();
		if (!session || session.type !== 'return') {
			session = startCheckoutSession('return');
		}
		currentSession = session;

		// Restore processed items from session
		if (session.items.length > 0) {
			const uniqueItems = dedupeSessionItems(session.items);
			processedItems = uniqueItems.map((item) => ({
				rfidData: item.rfidData,
				mediaItem: item.mediaItem,
				directive: item.directive ?? null,
				status: item.status === 'success' ? 'success' : 'failed',
				message: item.message,
				component: null
			}));
		}

		// Create a reader instance from URL params or localStorage
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
				'No reader configured. Add middleware_id and reader_id to the URL before returning items.';
			return;
		}

		readerError = null;

		const unsubscribe = reader.startMonitoring((event) => {
			clientLogger.debug('Event type:', event.type);
			clientLogger.debug('Item:', event.item);

			if (event.type === 'added') {
				clientLogger.info('New item detected:', event.item.id);
				processItem(event.item);
			}
		});

		// Store the unsubscribe function
		readerUnsubscribe = unsubscribe;
	});

	onDestroy(() => {
		if (readerUnsubscribe) {
			readerUnsubscribe();
			readerUnsubscribe = null;
		}
		readerInstance = null;
	});

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
		goto(`/checkout${page.url.search}`);
	}
</script>

<div class="app-page-bg-checkout min-h-screen p-8">
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
			class="mb-8 flex flex-col gap-4 rounded-2xl bg-base-100/10 p-6 shadow-lg backdrop-blur-sm md:flex-row md:items-center md:justify-between"
		>
			<div class="flex items-center gap-4">
				<div class="rounded-2xl bg-base-100/20 p-3 text-white shadow-lg">
					<Undo2 class="h-8 w-8" />
				</div>
				<div class="text-white">
					<h1 class="text-4xl font-bold drop-shadow-lg">Return Books</h1>
					<p class="text-base opacity-90">Place your items on the reader</p>
				</div>
			</div>
			<div class="md:ml-auto">
				<button class="btn shadow-xl btn-lg btn-accent" onclick={handleDoneClick}>
					<Check />Done
				</button>
			</div>
		</header>

		<div class="mb-8">
			<div class="card bg-base-100 shadow-2xl">
				<div class="card-body p-0">
					<ul class="">
						<li
							class="flex flex-row items-center justify-between menu-title px-6 py-4 text-base opacity-70"
						>
							<span class="text-lg">Items to Return</span>
							<span class="badge badge-lg badge-info">{processedItems.length}</span>
						</li>
						{#each processedItems as item (item.rfidData.id)}
							{@const directive = item.directive ?? item.mediaItem?.returnDirective}
							<li
								class="border-t border-base-200"
								in:fly={{ y: -10, duration: 160 }}
								out:fade={{ duration: 120 }}
								animate:flip={{ duration: 200 }}
							>
								<div class="flex flex-col gap-4 p-4 hover:bg-base-200 md:flex-row md:items-center">
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
										{#if item.status === 'checking' || item.status === 'returning'}
											<div
												class="card w-full border border-base-300 bg-base-100 px-4 py-3 shadow-sm"
											>
												<div class="flex flex-col gap-2">
													{#if directive}
														<div class="badge {getDirectiveBadgeClass(directive.color)} badge-sm">
															{directive.label}
														</div>
													{/if}
													<div class="flex items-center gap-3">
														<span class="loading loading-md loading-spinner text-info"></span>
														<span class="text-left text-base">{item.message}</span>
													</div>
												</div>
											</div>
										{:else if item.status === 'success'}
											<div
												class="card w-full border border-success/40 bg-success/10 px-4 py-4 text-base text-success shadow-sm"
											>
												<div class="flex flex-col gap-2">
													{#if directive}
														<div class="badge {getDirectiveBadgeClass(directive.color)} badge-sm">
															{directive.label}
														</div>
													{/if}
													<div class="flex items-center gap-3">
														<Check />
														<span class="text-left">{item.message}</span>
													</div>
												</div>
											</div>
										{:else if item.status === 'failed'}
											<div
												class="card w-full border border-error/40 bg-error/10 px-4 py-4 text-base text-error shadow-sm"
											>
												<div class="flex flex-col gap-2">
													{#if directive}
														<div class="badge {getDirectiveBadgeClass(directive.color)} badge-sm">
															{directive.label}
														</div>
													{/if}
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
									icon={RotateCcw}
									title="Ready to Return"
									description="Place items on the reader to begin"
								/>
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
