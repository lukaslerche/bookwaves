<script lang="ts">
	import RFIDItem from '$lib/components/RFIDItem.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { BookOpen } from '@lucide/svelte';
	import type { PageProps } from './$types';
	import { onDestroy, onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { createReaderFromParams } from '$lib/stores/reader-selection';
	import type { RFIDData } from '$lib/reader/interface';
	import { page } from '$app/state';
	import { clientLogger } from '$lib/client/logger';

	let { data }: PageProps = $props();
	let detectedItems: Array<RFIDData> = $state([]);
	let readerUnsubscribe: (() => void) | null = null;
	const missingReaderParams = $derived(
		!data.readerConfig.middlewareId || !data.readerConfig.readerId
	);
	let readerError: string | null = $state(null);
	const readerWarning = $derived(
		readerError ??
			(missingReaderParams
				? 'Reader configuration is missing. Add middleware_id and reader_id to the URL.'
				: null)
	);

	// Get current query string to preserve reader config
	let queryString = $derived(page.url.search);

	onMount(async () => {
		clientLogger.debug('Page data:', data);

		// Create a reader instance from URL params or localStorage
		const reader = createReaderFromParams(
			data.readerConfig.middlewareId,
			data.readerConfig.readerId,
			data.readerConfig.middlewareUrl,
			data.readerConfig.middlewareType
		);

		if (!reader) {
			clientLogger.error(
				'No reader configured. Please configure a reader via URL params or admin page.'
			);
			readerError =
				'No reader configured. Add middleware_id and reader_id to the URL before viewing device items.';
			return;
		}

		readerError = null;

		// Set up a callback to handle RFID events
		readerUnsubscribe = reader.startMonitoring((event) => {
			clientLogger.debug('Event type:', event.type);
			clientLogger.debug('Item:', event.item);

			switch (event.type) {
				case 'added':
					clientLogger.info('New item detected:', event.item.id);
					detectedItems = [
						event.item,
						...detectedItems.filter((i) => i.id !== event.item.id)
					];
					break;
				case 'removed':
					clientLogger.info('Item removed:', event.item.id);
					detectedItems = detectedItems.filter((i) => i.id !== event.item.id);
					break;
				case 'updated':
					clientLogger.info('Item updated:', event.item.id);
					detectedItems = detectedItems.map((i) => (i.id === event.item.id ? event.item : i));
					break;
			}
		});
	});

	onDestroy(() => {
		if (readerUnsubscribe) {
			readerUnsubscribe();
			readerUnsubscribe = null;
		}
	});
</script>

<div class="min-h-screen bg-linear-to-br from-primary to-secondary p-8">
	<div class="mx-auto max-w-6xl">
		{#if readerWarning}
			<div class="mb-6 alert alert-warning shadow-lg">
				<div>
					<strong>Reader not configured.</strong>
					{readerWarning} Contact IT/library staff.
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
		<PageHeader title="View Items" subtitle="Currently on the device" />

		<div class="card mb-8 bg-base-100 shadow-2xl">
			<div class="card-body p-0">
				<ul class="">
					<li class="menu-title px-6 py-4 text-base opacity-70">
						<span class="text-lg">On Device</span>
					</li>
					{#each detectedItems as item (item.id)}
						<li
							class="border-t border-base-200"
							in:fly={{ y: -10, duration: 160 }}
							out:fade={{ duration: 120 }}
							animate:flip={{ duration: 200 }}
						>
							<div class="p-4 hover:bg-base-200">
								<RFIDItem {item} />
							</div>
						</li>
					{:else}
						<li class="px-6 py-8 text-center">
							<div class="flex flex-col items-center gap-4 opacity-60">
								<BookOpen class="h-20 w-20 text-base-content/30" />
								<p class="text-xl">No items detected</p>
								<p class="text-base">Place items on the reader</p>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		</div>

		<div class="flex justify-center">
			<a href="/checkout{queryString}" class="btn px-10 text-xl shadow-xl btn-lg btn-accent">
				← Back to Menu
			</a>
		</div>
	</div>
</div>
