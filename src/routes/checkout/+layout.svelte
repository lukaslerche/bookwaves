<script lang="ts">
	import MockReaderOverlay from '$lib/components/MockReaderOverlay.svelte';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
	const isMockMiddleware = $derived(data.readerConfig?.middlewareType?.toLowerCase?.() === 'mock');
	const configHints = $derived(
		[
			data.readerConfig?.middlewareId && `middleware_id=${data.readerConfig.middlewareId}`,
			data.readerConfig?.readerId && `reader_id=${data.readerConfig.readerId}`,
			data.checkoutProfileId && `checkout_profile_id=${data.checkoutProfileId}`
		].filter((value): value is string => Boolean(value))
	);
</script>

{@render children?.()}

{#if configHints.length > 0}
	<div
		class="pointer-events-none fixed top-2 right-2 z-40 rounded border border-black/10 bg-white/20 px-2 py-1 text-[10px] leading-tight text-black/45 backdrop-blur-sm"
	>
		{#each configHints as hint (hint)}
			<div>{hint}</div>
		{/each}
	</div>
{/if}

{#if isMockMiddleware}
	<MockReaderOverlay />
{/if}
