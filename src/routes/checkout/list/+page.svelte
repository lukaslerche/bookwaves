<script lang="ts">
	import RFIDItem from '$lib/components/RFIDItem.svelte';
	import { BookOpen, List as ListIcon } from '@lucide/svelte';
	import type { PageProps } from './$types';
	import { onDestroy, onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import { createReaderFromParams } from '$lib/stores/reader-selection';
	import type { RFIDData } from '$lib/reader/interface';
	import { page } from '$app/state';
	import { clientLogger } from '$lib/client/logger';
	import { m } from '$lib/paraglide/messages';

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
					detectedItems = [event.item, ...detectedItems.filter((i) => i.id !== event.item.id)];
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

<div class="app-page-bg-checkout min-h-screen p-8">
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
		<header
			class="mb-8 flex flex-col gap-4 rounded-2xl bg-base-100/10 p-6 shadow-lg backdrop-blur-sm md:flex-row md:items-center md:justify-between"
		>
			<div class="flex items-center gap-4">
				<div class="rounded-2xl bg-base-100/20 p-3 text-white shadow-lg">
					<ListIcon class="h-8 w-8" />
				</div>
				<div class="text-white">
					<h1 class="text-4xl font-bold drop-shadow-lg">{m.view_items()}</h1>
					<p class="text-base opacity-90">{m.currently_on_the_device()}</p>
				</div>
			</div>
			<div class="md:ml-auto">
				<a href="/checkout{queryString}" class="btn shadow-xl btn-lg btn-accent">
					← {m.back()}
				</a>
			</div>
		</header>

		<div class="card mb-8 bg-base-100 shadow-2xl">
			<div class="card-body p-0">
				<ul class="">
					<li class="menu-title px-6 py-4 text-base opacity-70">
						<span class="text-lg">{m.on_device()}</span>
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
								<p class="text-xl">{m.no_items_detected()}</p>
								<p class="text-base">{m.place_items_on_the_reader()}</p>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	</div>
</div>
