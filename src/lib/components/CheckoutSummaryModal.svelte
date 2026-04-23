<script lang="ts">
	import type { CheckoutSession, SessionItem } from '$lib/stores/checkout-session';
	import { getSuccessfulItems } from '$lib/stores/checkout-session';
	import type { LmsReturnDirective } from '$lib/lms/lms';
	import { Check, TriangleAlert } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';
	import { onDestroy, onMount } from 'svelte';
	import { createIdleCountdown, IDLE_TIMEOUT_SECONDS } from '$lib/client/idle-countdown';

	type Props = {
		session: CheckoutSession;
		onConfirm: () => void;
	};

	let { session, onConfirm }: Props = $props();
	let countdownSeconds = $state(IDLE_TIMEOUT_SECONDS);
	const countdownProgress = $derived(Math.round((countdownSeconds / IDLE_TIMEOUT_SECONDS) * 100));
	let didConfirm = false;

	const successfulItems = $derived(getSuccessfulItems(session));
	const failedItems = $derived(session.items.filter((item) => item.status !== 'success'));

	const actionText = $derived(session.type === 'borrow' ? m.borrowed() : m.returned());

	const fallbackDirective: LmsReturnDirective = {
		binId: 'unspecified',
		label: 'No bin assigned',
		color: 'neutral',
		message: 'No sorting instruction provided',
		sortOrder: 99
	};

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

	function getReturnDirective(item: SessionItem): LmsReturnDirective | null {
		if (session.type !== 'return') return null;
		return item.directive ?? item.mediaItem?.returnDirective ?? fallbackDirective;
	}

	const idleCountdown = createIdleCountdown({
		seconds: IDLE_TIMEOUT_SECONDS,
		onTick: (remainingSeconds) => {
			countdownSeconds = remainingSeconds;
		},
		onExpired: () => {
			handleConfirm();
		}
	});

	function handleConfirm() {
		if (didConfirm) return;
		didConfirm = true;
		onConfirm();
	}

	onMount(() => {
		idleCountdown.start();
	});

	onDestroy(() => {
		idleCountdown.stop();
	});
</script>

<dialog class="modal-open modal">
	<div class="modal-box max-w-3xl">
		<h3 class="mb-6 text-2xl font-bold">
			{session.type === 'borrow' ? m.borrow_label() : m.return_label()}
			{m.summary()}
		</h3>

		<div
			class="modal-action mt-0 mb-6 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
		>
			<div class="w-full rounded-xl bg-base-200/70 px-3 py-2 sm:max-w-56">
				<div
					class="mb-1 flex items-center justify-between text-xs font-semibold tracking-wide uppercase"
				>
					<span>Timeout</span>
					<span>{countdownSeconds}s</span>
				</div>
				<progress class="progress w-full progress-primary" value={countdownProgress} max="100"
				></progress>
			</div>
			<button class="btn btn-block btn-primary sm:w-auto" onclick={handleConfirm}>
				{successfulItems.length > 0 ? m.finish_and_logout() : m.close()}
			</button>
		</div>

		{#if successfulItems.length > 0}
			<div class="mb-6">
				<h4 class="mb-3 text-lg font-semibold text-success">
					✓ {m.successfully()}
					{actionText}: {successfulItems.length}
					{successfulItems.length === 1 ? m.medium() : m.media()}
				</h4>

				<ul class="space-y-2">
					{#each successfulItems as item (item.rfidData.id)}
						{@const directive = getReturnDirective(item)}
						<li class="flex items-stretch gap-3 rounded-lg bg-success/10 p-3">
							<span class="text-success"><Check /></span>
							<div class="grid min-w-0 flex-1 grid-cols-[1fr_auto_auto] items-stretch gap-4">
								<div class="min-w-0">
									<p class="font-medium">
										{item.mediaItem?.title || 'Unknown Item'}
									</p>
									{#if item.mediaItem?.author}
										<p class="text-sm opacity-70">by {item.mediaItem.author}</p>
									{/if}
									{#if item.mediaItem?.date}
										<p class="mt-1 text-xs opacity-70">{item.mediaItem.date}</p>
									{/if}
								</div>
								<div
									class="flex items-center justify-center px-2 text-sm font-semibold text-base-content/70"
								>
									{item.mediaItem?.shelfmark ?? '—'}
								</div>
								{#if directive}
									<div class="flex flex-col items-end justify-center gap-1">
										<div
											class={`badge badge-lg ${getDirectiveBadgeClass(directive.color)} rounded-md px-4`}
										>
											{directive.label}
										</div>
										{#if directive.message}
											<p class="max-w-48 text-right text-xs text-base-content/70">
												{directive.message}
											</p>
										{/if}
									</div>
								{:else}
									<div></div>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if failedItems.length > 0}
			<div class="mb-6">
				<h4 class="mb-3 text-lg font-semibold text-warning">
					⚠ {failedItems.length}
					{failedItems.length === 1 ? m.medium() : m.media()}
					{m.could_not_be_processed()}
				</h4>
				<ul class="space-y-2">
					{#each failedItems as item (item.rfidData.id)}
						{@const directive = getReturnDirective(item)}
						<li class="flex items-stretch gap-3 rounded-lg bg-warning/10 p-3">
							<span class="text-warning"><TriangleAlert /></span>
							<div class="grid min-w-0 flex-1 grid-cols-[1fr_auto_auto] items-stretch gap-4">
								<div class="min-w-0">
									<p class="font-medium">
										{item.mediaItem?.title || 'Unknown Item'}
									</p>
									{#if item.mediaItem?.author}
										<p class="text-sm opacity-70">by {item.mediaItem.author}</p>
									{/if}
									{#if item.mediaItem?.date}
										<p class="mt-1 text-xs opacity-70">{item.mediaItem.date}</p>
									{/if}
									<p class="mt-1 text-sm text-error">{item.message}</p>
								</div>
								<div
									class="flex items-center justify-center px-2 text-sm font-semibold text-base-content/70"
								>
									{item.mediaItem?.shelfmark ?? '—'}
								</div>
								{#if directive}
									<div class="flex items-center justify-center">
										<div
											class={`badge badge-lg ${getDirectiveBadgeClass(directive.color)} rounded-md px-4`}
										>
											{directive.label}
										</div>
									</div>
								{:else}
									<div></div>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if successfulItems.length === 0 && failedItems.length === 0}
			<div class="py-8 text-center">
				<p class="text-lg opacity-70">{m.no_items_processed()}.</p>
			</div>
		{/if}
	</div>
</dialog>
