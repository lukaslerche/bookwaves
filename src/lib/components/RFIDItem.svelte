<script lang="ts">
	import type { RFIDData } from '$lib/reader/interface';
	import type { MediaItem } from '$lib/lms/lms';
	import { getItem } from '$lib/lms/lms.remote';
	import { onMount } from 'svelte';
	import { Lock, LockOpen, Tag } from '@lucide/svelte';
	import { clientLogger } from '$lib/client/logger';

	let {
		item,
		highlight = false,
		showRfidDetails = false,
		onMediaItemLoaded,
		showBin = true,
		showSecurity = true,
		showLibraryLocation = true,
		showPublicationLine = true
	}: {
		item: RFIDData;
		highlight?: boolean;
		showRfidDetails?: boolean;
		onMediaItemLoaded?: (mediaItem: MediaItem | null) => void;
		showBin?: boolean;
		showSecurity?: boolean;
		showLibraryLocation?: boolean;
		showPublicationLine?: boolean;
	} = $props();

	let mediaItem = $state<MediaItem | null>(null);
	let loading = $state(true);
	let fetchError = $state<string | null>(null);

	onMount(async () => {
		await fetchMediaItem();
	});

	async function fetchMediaItem() {
		loading = true;
		fetchError = null;
		try {
			mediaItem = await getItem(item.mediaId || item.id);
			if (onMediaItemLoaded) {
				onMediaItemLoaded(mediaItem);
			}
		} catch (error) {
			clientLogger.error('Failed to fetch media item:', error);
			mediaItem = null;
			fetchError = 'Unable to load media information. Please try again.';
			if (onMediaItemLoaded) {
				onMediaItemLoaded(null);
			}
		} finally {
			loading = false;
		}
	}

	// Expose refresh function for parent components
	export async function refresh() {
		await fetchMediaItem();
	}

	function formatTimestamp(date: Date): string {
		return date.toLocaleTimeString();
	}

	function getSignalStrength(rssi?: number): string {
		if (!rssi) return 'Unknown';
		if (rssi > -50) return 'Excellent';
		if (rssi > -60) return 'Good';
		if (rssi > -70) return 'Fair';
		return 'Weak';
	}

	function getStatusBadgeClass(status?: string): string {
		switch (status) {
			case 'available':
				return 'badge-success';
			case 'borrowed':
				return 'badge-warning';
			case 'reserved':
				return 'badge-info';
			default:
				return 'badge-ghost';
		}
	}

	function getDirectiveBadgeClass(color?: string): string {
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

	function getSecuredBadgeClass(secured?: boolean): string {
		return secured ? 'badge-error' : 'badge-success';
	}

	function getSecuredText(secured?: boolean): string {
		if (secured === undefined) return 'Unknown';
		return secured ? 'Secured' : 'Unsecured';
	}

	function getDisplayTitle(currentItem: MediaItem | null): string {
		if (!currentItem) return item.id;
		return currentItem.title || currentItem.barcode;
	}

	function formatPublicationInfo(currentItem: MediaItem): string {
		return [currentItem.edition, currentItem.publisher, currentItem.place]
			.filter(Boolean)
			.join(' · ');
	}
</script>

<div
	class="rfid-item card border bg-base-100 shadow-sm {highlight
		? 'border-2 border-error bg-error/10'
		: 'border-base-300'}"
>
	<div class="card-body p-4">
		{#if loading}
			<div class="flex items-start gap-3">
				<div class="h-45 w-32 shrink-0 skeleton rounded-box"></div>
				<div class="flex min-w-0 flex-1 flex-col gap-3">
					<div class="h-5 w-3/4 skeleton"></div>
					<div class="h-4 w-1/2 skeleton"></div>
					<div class="h-3 w-2/3 skeleton"></div>
					<div class="flex flex-wrap gap-2">
						<div class="h-5 w-16 skeleton rounded-full"></div>
						<div class="h-5 w-20 skeleton rounded-full"></div>
						<div class="h-5 w-24 skeleton rounded-full"></div>
					</div>
					<div class="flex flex-wrap gap-2">
						<div class="h-4 w-16 skeleton rounded-full"></div>
						<div class="h-4 w-20 skeleton rounded-full"></div>
						<div class="h-4 w-24 skeleton rounded-full"></div>
					</div>
				</div>
			</div>
		{:else if mediaItem}
			<!-- Media Item Information -->
			<div class="flex items-stretch gap-3">
				{#if mediaItem.cover}
					<img
						alt={mediaItem.title}
						class="h-45 shrink-0 rounded-box object-cover"
						src={mediaItem.cover}
					/>
				{/if}
				<div class="min-w-0 flex-1">
					<h3 class="card-title truncate text-2xl font-semibold">
						{getDisplayTitle(mediaItem)}
					</h3>
					{#if mediaItem.author}
						<div class="text-xl opacity-80">{mediaItem.author}</div>
					{/if}
					{#if showPublicationLine && formatPublicationInfo(mediaItem)}
						<div class="text-xs opacity-70">{formatPublicationInfo(mediaItem)}</div>
					{/if}
					<div class="mt-1 text-xs font-semibold uppercase opacity-60">
						{#if mediaItem.date}
							{mediaItem.date}
						{/if}
					</div>
					<div class="mt-2 flex flex-wrap gap-2">
						{#if mediaItem.status}
							<div class="badge {getStatusBadgeClass(mediaItem.status)} badge-sm">
								{mediaItem.status}
							</div>
						{/if}
						<!--{#if mediaItem.status === 'borrowed' && mediaItem.dueDate}
							<div class="badge badge-outline badge-sm">
								Due: {mediaItem.dueDate.toLocaleDateString()}
							</div>
						{/if}-->
						{#if showSecurity && item.secured !== undefined}
							<div class="badge {getSecuredBadgeClass(item.secured)} badge-sm">
								{#if item.secured}
									<Lock size={16} />
								{:else}
									<LockOpen size={16} />
								{/if}
								{getSecuredText(item.secured)}
							</div>
						{/if}
					</div>
					{#if showLibraryLocation && (mediaItem.library || mediaItem.location)}
						<div class="mt-2 flex flex-wrap gap-2 text-xs opacity-70">
							{#if mediaItem.library}
								<div class="badge badge-outline badge-sm">{mediaItem.library}</div>
							{/if}
							{#if mediaItem.location}
								<div class="badge badge-outline badge-sm">{mediaItem.location}</div>
							{/if}
						</div>
					{/if}
				</div>
				{#if mediaItem.shelfmark || (showBin && mediaItem.returnDirective)}
					<div class="flex min-w-[160px] items-center justify-center gap-3 text-center">
						{#if mediaItem.shelfmark}
							<span class="text-lg font-semibold text-base-content/70">
								{mediaItem.shelfmark}
							</span>
						{/if}
						{#if showBin && mediaItem.returnDirective}
							<span
								class="badge badge-lg {getDirectiveBadgeClass(
									mediaItem.returnDirective.color
								)} rounded-md px-4"
							>
								{mediaItem.returnDirective.label}
							</span>
						{/if}
					</div>
				{/if}
			</div>

			{#if showRfidDetails}
				<!-- RFID Technical Information (Collapsible) -->
				<div class="divider my-2 text-xs opacity-40">RFID Tag Details</div>
			{/if}
		{/if}

		{#if showRfidDetails}
			<!-- RFID Information (always shown) -->
			<div class="flex items-start justify-between gap-2">
				<div class="flex-1">
					<h3 class="card-title text-sm font-normal opacity-70">
						<Tag size={16} />
						EPC: {item.id} <br /> Barcode: {item?.mediaId ?? 'N/A'}
					</h3>
					<p class="mt-1 text-xs opacity-60">
						Detected at {formatTimestamp(item.timestamp)}
					</p>
				</div>

				<div class="flex flex-col items-end gap-1">
					{#if item.rssi}
						<div class="badge badge-outline badge-sm">
							{getSignalStrength(item.rssi)} ({item.rssi} dBm)
						</div>
					{/if}
					{#if item.secured !== undefined}
						<div class="badge {getSecuredBadgeClass(item.secured)} badge-sm">
							{getSecuredText(item.secured)}
						</div>
					{/if}
				</div>
			</div>

			{#if item.data}
				<div class="mt-2 text-sm">
					<span class="font-medium">Data:</span>
					<code class="ml-2 rounded bg-base-200 px-2 py-1 text-xs">{item.data}</code>
				</div>
			{/if}
		{/if}

		{#if !loading && !mediaItem}
			<div class="mt-3 flex min-h-40 items-start gap-3">
				<div class="h-45 w-32 shrink-0 skeleton rounded-box"></div>
				<div class="flex min-w-0 flex-1 flex-col gap-2 text-xs">
					<div class="text-sm font-semibold">Media information unavailable</div>
					<div class="italic opacity-60">
						{fetchError ?? 'No media information found for this RFID tag'}
					</div>
					<button class="btn w-full btn-outline btn-sm" onclick={fetchMediaItem}> Reload </button>
				</div>
			</div>
		{/if}
	</div>
</div>

<style>
	.rfid-item {
		transition: all 0.2s ease;
	}

	.rfid-item:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}
</style>
