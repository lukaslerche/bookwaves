<script lang="ts">
	import RFIDItem from '#lib/components/RFIDItem.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { AlertTriangle, CheckCircle, Eye, ShieldAlert, Lock } from '@lucide/svelte';
	import { onDestroy, onMount } from 'svelte';
	import { fly, fade } from 'svelte/transition';
	import { flip } from 'svelte/animate';
	import type { PageProps } from './$types';
	import { createReaderFromParams, getReaderConfigProblem } from '#lib/stores/reader-selection.js';
	import type { RFIDData } from '#lib/reader/interface.js';
	import { clientLogger } from '#lib/client/logger.js';
	import { m } from '#lib/paraglide/messages.js';

	let { data }: PageProps = $props();

	let detectedItems: Array<RFIDData> = $state([]);
	let showAllDetectedItems = $derived(data.gateConfig?.showAllDetectedItems ?? true);
    const hideLocation = $derived(data.gateConfig?.hideLocation ?? false);
    const compact = $derived(data.gateConfig?.compact ?? false);
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
		readerError ?? (missingReaderParams ? m.no_reader_found_message() : null)
	);
	// Distinguishes "no reader selected yet" (normal) from "the configured middleware's type is
	// not one BookWaves recognises" (a real configuration problem) so both stop reading as the
	// same reader_not_configured state.
	const readerConfigProblem = $derived(getReaderConfigProblem(data.readerConfig.middlewareType));

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
				readerConfigProblem === 'unknown_middleware_type'
					? m.reader_type_not_recognised_message({
							type: data.readerConfig.middlewareType ?? ''
						})
					: m.no_reader_found_while_monitoring_message();
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
				case 'stable':
				case 'unstable':
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

<div class="app-page-bg-gate min-h-screen flex flex-col p-6 md:p-8 overflow-hidden">
    
    {#if readerWarning}
        <div class="w-full mb-4 alert alert-warning shadow-lg flex justify-between items-center shrink-0">
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

    <div class="mx-auto max-w-7xl w-full flex flex-1 min-h-0
        {!compact ? 'flex-col' : 'flex-row'}
        {!compact || detectedItems.length === 0 ? 'justify-center items-center' : 'items-stretch gap-8'}">
        
        <div class="flex flex-col justify-start w-max
            {compact || detectedItems.length === 0 ? 'items-center text-center justify-center' : 'w-96 shrink-0 justify-center'}">
            <PageHeader title={m.gate_label()} showLogo />

            <div class="my-6 flex items-center justify-center">
                {#if detectedItems.some((item) => item.secured)}
                    <div
                        class="flex flex-col animate-pulse items-center gap-3 rounded-box border-4 border-white bg-error px-8 py-5 text-3xl font-bold text-white shadow-2xl"
                    >
                        <ShieldAlert class="h-12 w-12" />
                        <span>{m.secured_item_detected()}</span>
                    </div>
                {:else if detectedItems.length > 0}
                    <div
                        class="flex flex-col items-center gap-3 rounded-box border-4 border-white bg-success px-8 py-5 text-3xl font-bold text-white shadow-2xl"
                    >
                        <CheckCircle class="h-10 w-10" />
                        <span>{m.all_clear()}</span>
                    </div>
                {:else}
                    <div
                        class="flex flex-col items-center gap-3 rounded-box border-4 border-white/50 bg-base-300 px-10 py-5 text-3xl font-bold opacity-80 shadow-2xl"
                    >
                        <Eye class="h-10 w-10" />
                        <span>{m.monitoring()}</span>
                    </div>
                {/if}
            </div>
        </div>

        {#if !compact || detectedItems.length > 0}
            <div class="flex-1 min-w-0 flex flex-col gap-4 min-h-0 justify-center w-full">
                {#if detectedItems.some((item) => item.secured)}
                    <div class="alert border-4 border-white alert-error text-white shadow-2xl flex items-center shrink-0">
                        <AlertTriangle class="h-16 w-16 shrink-0" />
                        <div>
                            <p class="text-3xl font-bold">{m.please_return_to_desk()}</p>
                            <p class="mt-1 text-xl">{m.please_return_to_desk_text()}</p>
                        </div>
                    </div>
                {/if}

                <div class="card bg-base-100 shadow-2xl w-full flex-1 flex flex-col min-h-0 overflow-hidden">
                    <div class="card-body p-0 flex flex-col flex-1 min-h-0">
                        <ul class="overflow-y-auto flex-1">
                            <li class="menu-title px-8 py-4 sticky top-0 bg-base-100/90 backdrop-blur-md z-10 border-b border-base-200">
                                <span class="text-xl font-semibold tracking-wide text-base-content/60">{listTitle}</span>
                            </li>
                            {#each visibleItems as item (item.id)}
                                <li
                                    class="border-t border-base-200"
                                    in:fly={{ y: -10, duration: 160 }}
                                    out:fade={{ duration: 120 }}
                                    animate:flip={{ duration: 200 }}
                                >
                                    <div class="p-2 hover:bg-base-200 {item.secured ? 'bg-error/10' : ''}">
                                        <RFIDItem {item} highlight={item.secured} showBadges={false} showBin={false} hideCoverPage={compact} {hideLocation}/>
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
            </div>
        {/if}

    </div>
</div>
