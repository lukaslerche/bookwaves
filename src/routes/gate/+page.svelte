<script lang="ts">
	import RFIDItem from '$lib/components/RFIDItem.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { AlertTriangle, CheckCircle, Eye, ShieldAlert, Lock } from '@lucide/svelte';
	import { onDestroy, onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import type { PageProps } from './$types';
	import { createReaderFromParams } from '$lib/stores/reader-selection';
	import type { RFIDData } from '$lib/reader/interface';
	import { clientLogger } from '$lib/client/logger';
	import { m } from '$lib/paraglide/messages';

	let { data }: PageProps = $props();

	let detectedItems: Array<RFIDData> = $state([]);
	let showAllDetectedItems = $derived(data.gateConfig?.showAllDetectedItems ?? true);
	let visibleItems = $derived(
		showAllDetectedItems ? detectedItems : detectedItems.filter((item) => item.secured)
	);
	let listTitle = $derived(showAllDetectedItems ? m.detected_items() : m.secured_items());
	let emptyMessage = $derived(
		showAllDetectedItems ? m.no_items_detected() : m.no_secured_items_detected()
	);
	let readerUnsubscribe: (() => void) | null = null;
	let audioElement: HTMLAudioElement | null = null;
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

	// TODO: Hide them after a timeout

	function playWarningSound() {
		if (audioElement) {
			audioElement.currentTime = 0;
			audioElement.play().catch((err) => clientLogger.error('Failed to play warning sound:', err));
		}
	}

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
				'No reader configured. Add middleware_id and reader_id to the URL before monitoring the gate.';
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
					// Play warning sound if item is secured
					if (event.item.secured) {
						playWarningSound();
					}
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

<!-- Warning sound audio element -->
<audio bind:this={audioElement}>
	<source src="/warning.mp3" type="audio/mpeg" />
	<source src="/warning.ogg" type="audio/ogg" />
</audio>

<div class="app-page-bg-gate min-h-screen p-8">
	<div class="mx-auto max-w-7xl">
		{#if readerWarning}
			<div class="mb-6 alert alert-warning shadow-lg">
				<div>
					<strong>{m.reader_not_configured()}.</strong>
					{readerWarning}
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
		<PageHeader title={m.gate_label()} showLogo />

		<div class="mb-8 flex items-center justify-center">
			{#if detectedItems.some((item) => item.secured)}
				<div
					class="flex animate-pulse items-center gap-3 rounded-box border-4 border-white bg-error px-10 py-5 text-3xl font-bold text-white shadow-2xl"
				>
					<ShieldAlert class="h-12 w-12" />
					<span>{m.secured_item_detected()}</span>
				</div>
			{:else if detectedItems.length > 0}
				<div
					class="flex items-center gap-3 rounded-box border-4 border-white bg-success px-10 py-5 text-3xl font-bold text-white shadow-2xl"
				>
					<CheckCircle class="h-10 w-10" />
					<span>{m.all_clear()}</span>
				</div>
			{:else}
				<div
					class="flex items-center gap-3 rounded-box border-4 border-white/50 bg-base-300 px-10 py-5 text-3xl font-bold opacity-80 shadow-2xl"
				>
					<Eye class="h-10 w-10" />
					<span>{m.monitoring()}</span>
				</div>
			{/if}
		</div>

		<div class="card bg-base-100 shadow-2xl">
			<div class="card-body p-0">
				<ul class="">
					<li class="menu-title px-8 py-6 text-xl opacity-70">
						<span class="text-2xl">{listTitle}</span>
					</li>
					{#each visibleItems as item (item.id)}
						<li
							class="border-t border-base-200"
							in:fly={{ y: -10, duration: 160 }}
							out:fade={{ duration: 120 }}
							animate:flip={{ duration: 200 }}
						>
							<div class="p-6 hover:bg-base-200 {item.secured ? 'bg-error/10' : ''}">
								<RFIDItem {item} highlight={item.secured} />
							</div>
						</li>
					{:else}
						<li class="px-8 py-16 text-center">
							<div class="flex flex-col items-center gap-6 opacity-60">
								<Lock class="h-24 w-24 text-base-content/30" />
								<p class="text-3xl font-semibold">{emptyMessage}</p>
								<p class="text-xl">
									{showAllDetectedItems
										? m.gate_is_clear()
										: m.no_secured_items_require_attention()}
								</p>
							</div>
						</li>
					{/each}
				</ul>
			</div>
		</div>

		{#if detectedItems.some((item) => item.secured)}
			<div class="mt-8 alert border-4 border-white alert-error text-white shadow-2xl">
				<AlertTriangle class="h-16 w-16 shrink-0" />
				<div>
					<p class="text-4xl font-bold">{m.please_return_to_desk()}</p>
					<p class="mt-2 text-2xl">{m.please_return_to_desk_text()}</p>
				</div>
			</div>
		{/if}
	</div>
</div>
