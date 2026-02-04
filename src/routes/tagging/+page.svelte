<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import type { RFIDData, RFIDReader } from '$lib/reader/interface';
	import ReaderSelector from '$lib/components/ReaderSelector.svelte';
	import { getSelectedReaderConfig, createReaderFromSelection } from '$lib/stores/reader-selection';
	import { Circle, CircleX, SquarePen } from '@lucide/svelte';
	import { clientLogger } from '$lib/client/logger';
	import MockReaderOverlay from '$lib/components/MockReaderOverlay.svelte';

	let { data }: { data: PageData } = $props();

	let input = $state('');
    let holder = $state('');
	let reader: RFIDReader | null = $state(null);
	let detectedItems: Array<RFIDData> = $state([]);
	let writing = $state(false);
	let lastWriteStatus = $state<'success' | 'error' | null>(null);
	let statusMessage = $state('');
	let polling = $state(false);
	let readerError = $state<string | null>(null);
	let pollingAbortController: AbortController | null = null;
	let overrideWhitelist = $state(false);

	const whitelistValues = $derived(data.whitelist ?? []);
	const whitelistEnabled = $derived(whitelistValues.length > 0);
	const currentTag = $derived(detectedItems.length === 1 ? detectedItems[0] : null);
	const currentTagWhitelisted = $derived(isWhitelisted(currentTag?.id));
	const whitelistBlocked = $derived(
		whitelistEnabled && currentTag && !overrideWhitelist && !currentTagWhitelisted
	);

	onMount(async () => {
		initializeReader();
	});

	function initializeReader() {
		// Stop any existing polling first
		stopPolling();
		overrideWhitelist = false;

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
			startPolling();
		} catch (error) {
			readerError = `Failed to initialize reader: ${error instanceof Error ? error.message : 'Unknown error'}`;
			clientLogger.error('Reader initialization error:', error);
		}
	}

	function isWhitelisted(tagId?: string | null) {
		if (!tagId) return false;
		return whitelistValues.some((prefix) => tagId.startsWith(prefix));
	}

	function wait(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	function stopPolling() {
		if (pollingAbortController) {
			pollingAbortController.abort();
			pollingAbortController = null;
		}
		polling = false;
	}

	async function startPolling() {
		stopPolling(); // Ensure no existing polling

		polling = true;
		pollingAbortController = new AbortController();
		const signal = pollingAbortController.signal;

		while (polling && !signal.aborted) {
			await loadItems();
			// Use a promise that can be aborted
			try {
				await new Promise((resolve, reject) => {
					const timeout = setTimeout(resolve, 1000);
					signal.addEventListener('abort', () => {
						clearTimeout(timeout);
						reject(new DOMException('Aborted', 'AbortError'));
					});
				});
			} catch (error) {
				if (error instanceof DOMException && error.name === 'AbortError') {
					break;
				}
			}
		}
	}

	async function loadItems() {
		if (!reader) return;
		try {
			detectedItems = await reader.inventory();
		} catch (error) {
			clientLogger.error('Failed to load items:', error);
		}
	}

	async function write() {
		if (!reader || writing || !input.trim()) return;

		if (detectedItems.length === 0) {
			lastWriteStatus = 'error';
			statusMessage = 'No tag detected. Please place a tag on the reader.';
			return;
		}

		if (detectedItems.length > 1) {
			lastWriteStatus = 'error';
			statusMessage = 'Multiple tags detected. Please ensure only one tag is on the reader.';
			return;
		}

		const tagId = detectedItems[0].id;
		if (whitelistEnabled && !overrideWhitelist && !isWhitelisted(tagId)) {
			lastWriteStatus = 'error';
			statusMessage = 'Tag is not on the whitelist. Enable override to proceed.';
			return;
		}

		writing = true;
		stopPolling();
		await wait(200);
		try {
			const result = await reader.initialize(input.trim(), holder.trim());
			if (!result.success) {
				lastWriteStatus = 'error';
				statusMessage = result.message || 'Failed to initialize tag. Please try again.';
				return;
			}
			lastWriteStatus = 'success';
			statusMessage = `Initialized tag ${tagId} with "${input.trim()}"`;
			input = '';
			await loadItems();
		} catch (error) {
			lastWriteStatus = 'error';
			statusMessage = 'Failed to initialize tag. Please try again.';
			clientLogger.error('Failed to initialize tag:', error);
		} finally {
			writing = false;
			if (reader) {
				startPolling();
			}
			setTimeout(() => {
				lastWriteStatus = null;
				statusMessage = '';
			}, 3000);
		}
	}

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			write();
		}
	}

	$effect(() => {
		return () => {
			stopPolling();
		};
	});
</script>

<div class="min-h-full bg-linear-to-br from-info to-primary p-8">
	<div class="mx-auto max-w-4xl">
		<header class="mb-12 text-center text-white">
			<h1 class="mb-3 text-5xl font-bold drop-shadow-lg">RFID Tagging</h1>
			<p class="text-xl opacity-90">Write book IDs to RFID tags</p>
			<div class="mt-6 flex justify-center">
				<ReaderSelector
					middlewareReaders={data.middlewareReaders}
					on:change={() => initializeReader()}
				/>
			</div>
		</header>

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
			<div class="card mb-6 bg-base-100 shadow-2xl">
				<div class="card-body">
					<h2 class="mb-4 card-title text-2xl">Tag Detection Status</h2>
					<div class="flex items-center gap-4">
						<div
							class="badge badge-lg {detectedItems.length === 1
								? 'badge-success'
								: detectedItems.length > 1
									? 'badge-warning'
									: 'badge-error'}"
						>
							{detectedItems.length === 1
								? '✓ Ready'
								: detectedItems.length > 1
									? '⚠ Multiple Tags'
									: '✗ No Tag'}
						</div>
						<span class="text-sm opacity-70">
							{detectedItems.length} tag{detectedItems.length !== 1 ? 's' : ''} detected
						</span>

						{#if whitelistEnabled}
							<div class="mt-2 flex flex-wrap items-center gap-2 text-sm">
								<span class="badge badge-outline badge-primary">Whitelist active</span>
								<span class="opacity-70">Allowed prefixes: {whitelistValues.join(', ')}</span>
							</div>
						{/if}
					</div>

					{#if detectedItems.length === 1}
						<div class="mt-4 rounded-lg bg-base-200 p-4">
							<div class="mb-2 text-sm font-semibold opacity-60">Current Tag on Reader</div>
							<div class="flex items-center gap-2">
								<div class="font-mono text-lg">{detectedItems[0].id}</div>
								{#if whitelistEnabled}
									<span
										class="badge badge-sm {currentTagWhitelisted ? 'badge-success' : 'badge-error'}"
									>
										{currentTagWhitelisted ? 'Whitelisted' : 'Not whitelisted'}
									</span>
								{/if}
							</div>
							{#if detectedItems[0].data}
								<div class="mt-2 text-sm">
									<span class="opacity-60">Current Data:</span>
									<span class="ml-2 font-semibold">{detectedItems[0].data}</span>
								</div>
							{/if}
						</div>
					{/if}

					{#if whitelistBlocked}
						<div class="mt-4 alert alert-warning">
							<Circle />
							<div>
								<h3 class="font-bold">Tag not on whitelist</h3>
								<div class="text-sm">
									This tag does not match the configured whitelist. Check your prefixes or enable
									the override below to proceed.
								</div>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<div class="card bg-base-100 shadow-2xl">
				<div class="card-body">
					<h2 class="mb-4 card-title text-2xl">Initialize Tag</h2>
					<p class="mb-4 text-sm opacity-70">
						Scan a barcode or type a book ID and press Enter to initialize the tag
					</p>

                    <div
                        class="form-control mb-4"
                        class:hidden={data.taggingFormats.length === 1}
                    >
                        <label class="label">
                            <span class="label-text text-lg">Holder</span>
                        </label>

                        <select
                            class="input-bordered input input-lg w-full"
                            bind:value={holder}
                            disabled={writing}
                        >
                            {#each data.taggingFormats as taggingFormat}
                                <option value={taggingFormat.name}>
                                    {taggingFormat.description}
                                </option>
                            {/each}
                        </select>
                    </div>
					<div class="form-control mb-4">
						<label class="label" for="book-id-input">
							<span class="label-text text-lg">Book ID</span>
						</label>
						<!-- svelte-ignore a11y_autofocus -->
						<input
							id="book-id-input"
							type="text"
							bind:value={input}
							onkeypress={handleKeyPress}
							placeholder="Scan barcode or enter book ID..."
							class="input-bordered input input-lg w-full"
							disabled={writing}
							autofocus
						/>
					</div>

					{#if whitelistEnabled}
						<label class="mb-3 flex items-center gap-3 text-sm">
							<input
								type="checkbox"
								class="checkbox checkbox-sm"
								bind:checked={overrideWhitelist}
							/>
							<span class="opacity-80">Override whitelist for this write</span>
						</label>
					{/if}

					<button
						class="btn w-full btn-lg btn-primary"
						onclick={write}
						disabled={writing || !input.trim() || detectedItems.length !== 1 || whitelistBlocked}
					>
						{#if writing}
							<span class="loading loading-spinner"></span>
							Initializing...
						{:else}
							<SquarePen />
							Initialize Tag
						{/if}
					</button>

					{#if lastWriteStatus}
						<div
							class="mt-4 alert {lastWriteStatus === 'success' ? 'alert-success' : 'alert-error'}"
						>
							<CircleX />
							<span>{statusMessage}</span>
						</div>
					{/if}
				</div>
			</div>
		{/if}

		<div class="mt-8 flex justify-center">
			<a href="/" class="btn text-white shadow-xl btn-ghost btn-lg"> ← Back to Home </a>
		</div>
	</div>
	<MockReaderOverlay />
</div>
