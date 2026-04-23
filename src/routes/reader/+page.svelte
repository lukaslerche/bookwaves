<script lang="ts">
	import RFIDItem from '$lib/components/RFIDItem.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import ReaderSelector from '$lib/components/ReaderSelector.svelte';
	import MockReaderOverlay from '$lib/components/MockReaderOverlay.svelte';
	import {
		Monitor,
		RefreshCw,
		Lock,
		LockOpen,
		Trash2,
		CircleX,
		SquarePen,
		Skull
	} from '@lucide/svelte';
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import type { RFIDData, RFIDReader } from '$lib/reader/interface';
	import { getSelectedReaderConfig, createReaderFromSelection } from '$lib/stores/reader-selection';
	import { clientLogger } from '$lib/client/logger';
	import { m } from '$lib/paraglide/messages';

	let { data }: { data: PageData } = $props();
	let detectedItems: Array<RFIDData> = $state([]);
	let reader: RFIDReader | null = $state(null);
	let loading = $state(false);
	let operationInProgress = $state<string | null>(null);
	let editingItem = $state<string | null>(null);
	let editData = $state('');
	let readerError = $state<string | null>(null);

	onMount(async () => {
		initializeReader();
	});

	function initializeReader() {
		const selectedConfig = getSelectedReaderConfig();
		if (!selectedConfig) {
			readerError = 'No reader selected. Please select a reader from the top menu.';
			return;
		}

		// Find the middleware instance to get URL and type
		const middleware = data.middlewareReaders.find(
			(middleware) => middleware.instance.id === selectedConfig.middleware
		);
		if (!middleware) {
			readerError = `Middleware "${selectedConfig.middleware}" not found in configuration.`;
			return;
		}

		try {
			reader = createReaderFromSelection(middleware.instance.url, middleware.instance.type);
			if (!reader) {
				readerError = 'Failed to create reader instance.';
				return;
			}
			readerError = null;
			clientLogger.info(
				{
					middlewareId: middleware.instance.id,
					middlewareType: middleware.instance.type,
					selectedReader: selectedConfig.reader,
					availableReaders: middleware.readers.length
				},
				'Initialized reader selection'
			);
			loadItems();
		} catch (error) {
			readerError = `Failed to initialize reader: ${error instanceof Error ? error.message : 'Unknown error'}`;
			clientLogger.error('Reader initialization error:', error);
		}
	}

	async function loadItems() {
		if (!reader) return;
		loading = true;
		try {
			detectedItems = await reader.inventory();
			clientLogger.info({ itemCount: detectedItems.length }, 'Loaded items for reader page');
		} catch (error) {
			clientLogger.error('Failed to load items:', error);
		} finally {
			loading = false;
		}
	}

	async function handleSecure(itemId: string) {
		if (!reader || operationInProgress) return;
		operationInProgress = itemId;
		try {
			await reader.secure(itemId);
			// sleep 100 ms
			await new Promise((resolve) => setTimeout(resolve, 200));
			await loadItems();
		} catch (error) {
			clientLogger.error('Failed to secure item:', error);
		} finally {
			operationInProgress = null;
		}
	}

	async function handleUnsecure(itemId: string) {
		if (!reader || operationInProgress) return;
		operationInProgress = itemId;
		try {
			await reader.unsecure(itemId);
			// sleep 100 ms
			await new Promise((resolve) => setTimeout(resolve, 200));
			await loadItems();
		} catch (error) {
			clientLogger.error('Failed to unsecure item:', error);
		} finally {
			operationInProgress = null;
		}
	}

	function startEdit(item: RFIDData) {
		editingItem = item.id;
		editData = item.data || '';
	}

	function cancelEdit() {
		editingItem = null;
		editData = '';
	}

	async function saveEdit(itemId: string) {
		if (!reader || operationInProgress) return;
		operationInProgress = itemId;
		try {
			await reader.edit(itemId, editData);
			await loadItems();
			editingItem = null;
			editData = '';
		} catch (error) {
			clientLogger.error('Failed to write item:', error);
		} finally {
			operationInProgress = null;
		}
	}

	async function handleClear(itemId: string) {
		if (!reader || operationInProgress) return;
		if (!confirm(m.confirm_clear())) return;
		operationInProgress = itemId;
		try {
			await reader.clear(itemId);
			await new Promise((resolve) => setTimeout(resolve, 200));
			await loadItems();
		} catch (error) {
			clientLogger.error('Failed to clear item:', error);
		} finally {
			operationInProgress = null;
		}
	}

	async function handleKill(itemId: string) {
		if (!reader || operationInProgress) return;
		if (!confirm(m.confirm_kill())) return;
		operationInProgress = itemId;
		try {
			await reader.kill(itemId);
			await loadItems();
		} catch (error) {
			clientLogger.error('Failed to kill item:', error);
		} finally {
			operationInProgress = null;
		}
	}
</script>

<div class="app-page-bg-reader min-h-full p-8">
	<div class="mx-auto max-w-7xl">
		<PageHeader title={m.reader_label()} subtitle={m.reader_description()} variant="compact" />
		<div class="mt-4">
			<ReaderSelector
				middlewareReaders={data.middlewareReaders}
				on:change={() => initializeReader()}
			/>
		</div>

		{#if readerError}
			<div class="mb-8 alert alert-error shadow-lg">
				<CircleX />
				<div>
					<h3 class="font-bold">Reader Error</h3>
					<div class="text-sm">{readerError}</div>
				</div>
				<button class="btn btn-sm" onclick={initializeReader}>Retry</button>
			</div>
		{:else}
			<div class="mb-6 flex items-center justify-between">
				<div class="text-white">
					<span class="text-2xl font-bold">{detectedItems.length}</span>
					<span class="ml-2 text-lg opacity-90">{m.items_detected()}</span>
				</div>
				<button class="btn shadow-xl btn-lg btn-accent" onclick={loadItems} disabled={loading}>
					{#if loading}
						<span class="loading loading-spinner"></span>
						{m.loading()}...
					{:else}
						<RefreshCw class="h-6 w-6" />
						{m.reload_items()}
					{/if}
				</button>
			</div>

			<div class="space-y-4">
				{#each detectedItems as item (item.id)}
					<div class="card bg-base-100 shadow-2xl">
						<div class="card-body">
							<div class="grid gap-6 lg:grid-cols-[6fr_1fr]">
								<div class="min-w-0">
									<RFIDItem {item} showRfidDetails />
								</div>

								<div class="flex flex-col gap-2">
									<div class="text-sm font-semibold uppercase opacity-60">
										{m.rfid_tag_actions()}
									</div>

									{#if editingItem === item.id}
										<div class="form-control gap-2">
											<label class="label" for={'edit-data-' + item.id}>
												<span class="label-text">{m.edit_tag_barcode()}</span>
											</label>
											<textarea
												id={'edit-data-' + item.id}
												class="textarea-bordered textarea h-24"
												bind:value={editData}
												placeholder="{m.enter_tag_data()}..."
											></textarea>
											<div class="flex gap-2">
												<button
													class="btn flex-1 btn-sm btn-primary"
													onclick={() => saveEdit(item.id)}
													disabled={operationInProgress === item.id}
												>
													{#if operationInProgress === item.id}
														<span class="loading loading-xs loading-spinner"></span>
													{/if}
													{m.save()}
												</button>
												<button
													class="btn btn-ghost btn-sm"
													onclick={cancelEdit}
													disabled={operationInProgress === item.id}
												>
													{m.cancel()}
												</button>
											</div>
										</div>
									{:else}
										<div class="grid grid-cols-2 gap-2">
											{#if item.secured}
												<button
													class="btn btn-sm btn-success"
													onclick={() => handleUnsecure(item.id)}
													disabled={operationInProgress === item.id}
												>
													{#if operationInProgress === item.id}
														<span class="loading loading-xs loading-spinner"></span>
													{:else}
														<LockOpen />
													{/if}
													{m.unsecure()}
												</button>
											{:else}
												<button
													class="btn btn-sm btn-error"
													onclick={() => handleSecure(item.id)}
													disabled={operationInProgress === item.id}
												>
													{#if operationInProgress === item.id}
														<span class="loading loading-xs loading-spinner"></span>
													{:else}
														<Lock />
													{/if}
													{m.secure()}
												</button>
											{/if}

											<button
												class="btn btn-sm btn-info"
												onclick={() => startEdit(item)}
												disabled={operationInProgress === item.id}
											>
												<SquarePen />
												{m.edit()}
											</button>

											<button
												class="btn btn-sm btn-warning"
												onclick={() => handleClear(item.id)}
												disabled={operationInProgress === item.id}
											>
												{#if operationInProgress === item.id}
													<span class="loading loading-xs loading-spinner"></span>
												{:else}
													<Trash2 />
												{/if}
												{m.clear()}
											</button>

											<button
												class="btn btn-outline btn-sm btn-error"
												onclick={() => handleKill(item.id)}
												disabled={operationInProgress === item.id}
											>
												{#if operationInProgress === item.id}
													<span class="loading loading-xs loading-spinner"></span>
												{:else}
													<Skull />
												{/if}
												{m.kill_tag()}
											</button>
										</div>
									{/if}
								</div>
							</div>
						</div>
					</div>
				{:else}
					<div class="card bg-base-100 shadow-2xl">
						<div class="card-body items-center py-16 text-center">
							<Monitor class="h-32 w-32 text-base-content/20" />
							<h2 class="card-title text-2xl">{m.no_items_detected()}</h2>
							<p class="text-base opacity-70">
								{m.no_items_detected_text()}
							</p>
						</div>
					</div>
				{/each}
			</div>
		{/if}

		<div class="mt-8 flex justify-center">
			<a href="/" class="btn text-white shadow-xl btn-ghost btn-lg"> ← {m.back()} </a>
		</div>
	</div>

	<MockReaderOverlay />
</div>
