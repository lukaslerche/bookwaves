<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { mockRFIDReader, type MockReaderMode } from '$lib/reader/mock';
	import type { RFIDData, RFIDEvent } from '$lib/reader/interface';
	import {
		Activity,
		Bug,
		Maximize,
		Minimize,
		MoveRight,
		Plus,
		SignalHigh,
		X
	} from '@lucide/svelte';

	let isOpen = $state(false);
	let mode = $state<MockReaderMode>(mockRFIDReader.getMode());
	let inventory: RFIDData[] = $state([]);
	let addable: RFIDData[] = $state([]);
	let selectedPoolId = $state('');
	let customId = $state('');
	let customLabel = $state('');
	let desiredRssi = $state(-55);

	const poolSelectId = 'mock-pool-select';
	const customIdInputId = 'mock-custom-id';
	const customLabelInputId = 'mock-custom-label';
	const defaultRssiId = 'mock-default-rssi';

	let unsubscribe: (() => void) | null = null;

	onMount(async () => {
		await refreshState();
		unsubscribe = mockRFIDReader.startMonitoring(handleEvent);
	});

	onDestroy(() => {
		unsubscribe?.();
	});

	async function refreshState() {
		inventory = await mockRFIDReader.inventory();
		addable = mockRFIDReader.getAddableItems();
		mode = mockRFIDReader.getMode();
	}

	function handleEvent(event: RFIDEvent) {
		// Keep local state in sync with the mock reader events
		switch (event.type) {
			case 'added':
				inventory = [...inventory.filter((item) => item.id !== event.item.id), event.item];
				break;
			case 'removed':
				inventory = inventory.filter((item) => item.id !== event.item.id);
				break;
			case 'updated':
			case 'stable':
			case 'unstable':
				inventory = inventory.map((item) => (item.id === event.item.id ? event.item : item));
				break;
		}

		addable = mockRFIDReader.getAddableItems();
	}

	function toggleMode() {
		const next = mode === 'auto' ? 'manual' : 'auto';
		mode = mockRFIDReader.setMode(next);
	}

	async function addFromPool() {
		if (!selectedPoolId) return;
		mockRFIDReader.addItemFromPool(selectedPoolId, { rssi: desiredRssi });
		selectedPoolId = '';
		await refreshState();
	}

	async function addCustomTag() {
		if (!customId.trim()) return;
		mockRFIDReader.addCustomItem(customId.trim(), customLabel.trim() || undefined, {
			rssi: desiredRssi
		});
		customId = '';
		customLabel = '';
		await refreshState();
	}

	function updateRssi(id: string, value: number) {
		mockRFIDReader.updateItemRssi(id, value);
	}

	async function removeTag(id: string) {
		mockRFIDReader.removeItem(id);
		await refreshState();
	}

	function getSecurityBadgeClass(secured?: boolean): string {
		if (secured === undefined) return 'badge-ghost';
		return secured ? 'badge-error' : 'badge-success';
	}

	function getSecurityLabel(secured?: boolean): string {
		if (secured === undefined) return 'Unknown';
		return secured ? 'Secured' : 'Unsecured';
	}

	async function setSecurity(id: string, secured: boolean) {
		if (secured) {
			await mockRFIDReader.secure(id);
			return;
		}

		await mockRFIDReader.unsecure(id);
	}

	function formatLabel(item: RFIDData): string {
		return item.data ? `${item.data} · ${item.id}` : item.id;
	}
</script>

<div class="fixed right-4 bottom-4 z-50 w-90 max-w-[92vw] text-base-content">
	<div
		class="overflow-hidden rounded-2xl border border-primary/40 bg-base-100/90 shadow-2xl shadow-primary/30 backdrop-blur"
	>
		<header
			class="flex items-center justify-between bg-linear-to-r from-primary to-secondary px-4 py-3 text-primary-content"
		>
			<div class="flex items-center gap-2">
				<div class="flex h-9 w-9 items-center justify-center rounded-full bg-white/10">
					<Bug class="h-5 w-5" />
				</div>
				<div>
					<p class="text-xs tracking-[0.08em] uppercase opacity-80">Mock reader</p>
					<p class="text-sm font-semibold">Demo & Debug deck</p>
				</div>
			</div>
			<button
				class="btn btn-circle btn-ghost text-primary-content btn-xs"
				onclick={() => (isOpen = !isOpen)}
				aria-label={isOpen ? 'Collapse mock reader overlay' : 'Expand mock reader overlay'}
			>
				{#if isOpen}
					<Minimize class="h-4 w-4" />
				{:else}
					<Maximize class="h-4 w-4" />
				{/if}
			</button>
		</header>

		{#if isOpen}
			<div class="space-y-4 p-4">
				<div
					class="flex items-start justify-between gap-3 rounded-xl border border-base-200 bg-base-200/40 px-3 py-2"
				>
					<div>
						<p class="text-xs tracking-wide text-base-content/60 uppercase">Mode</p>
						<p class="text-sm font-semibold">
							{mode === 'manual' ? 'Manual demo' : 'Auto simulation'}
						</p>
						<p class="text-xs text-base-content/60">
							{mode === 'manual'
								? 'You control what is on the pad.'
								: 'Tags appear and drift automatically.'}
						</p>
					</div>
					<button class="btn btn-primary btn-sm" onclick={toggleMode}>
						{mode === 'manual' ? 'Switch to auto' : 'Switch to manual'}
						<MoveRight class="h-4 w-4" />
					</button>
				</div>

				{#if mode === 'manual'}
					<div class="space-y-3 rounded-xl border border-dashed border-primary/40 bg-primary/5 p-3">
						<div class="flex items-center gap-2 text-sm font-semibold">
							<Activity class="h-4 w-4 text-primary" />
							<span>Add tags to the pad</span>
						</div>
						<div class="grid gap-2">
							<label class="text-xs tracking-wide text-base-content/60 uppercase" for={poolSelectId}
								>From pool</label
							>
							<div class="flex gap-2">
								<select
									id={poolSelectId}
									class="select-bordered select flex-1 select-sm"
									bind:value={selectedPoolId}
								>
									<option value="">Choose a sample tag</option>
									{#each addable as item (item.id)}
										<option value={item.id}>{formatLabel(item)}</option>
									{/each}
								</select>
								<button
									class="btn btn-secondary btn-sm"
									onclick={addFromPool}
									disabled={!selectedPoolId}
								>
									<Plus class="h-4 w-4" />
									Add
								</button>
							</div>
						</div>

						<div class="grid gap-2">
							<label
								class="text-xs tracking-wide text-base-content/60 uppercase"
								for={customIdInputId}>Custom tag</label
							>
							<div class="flex gap-2">
								<input
									id={customIdInputId}
									class="input-bordered input flex-1 input-sm"
									placeholder="EPC / barcode"
									bind:value={customId}
								/>
								<input
									id={customLabelInputId}
									class="input-bordered input flex-1 input-sm"
									placeholder="Display label (optional)"
									bind:value={customLabel}
								/>
								<button class="btn btn-sm" onclick={addCustomTag} disabled={!customId.trim()}>
									<Plus class="h-4 w-4" />
									Insert
								</button>
							</div>
						</div>

						<div class="grid gap-2">
							<label
								class="text-xs tracking-wide text-base-content/60 uppercase"
								for={defaultRssiId}>Default RSSI</label
							>
							<div class="flex items-center gap-3">
								<input
									type="range"
									class="range range-primary range-xs"
									min="-80"
									max="-25"
									step="1"
									id={defaultRssiId}
									bind:value={desiredRssi}
								/>
								<span class="badge badge-outline badge-sm">{desiredRssi}dBm</span>
							</div>
							<p class="text-[11px] text-base-content/60">Applied when adding tags above.</p>
						</div>
					</div>
				{:else}
					<div
						class="rounded-xl border border-base-200 bg-base-200/40 px-3 py-2 text-xs text-base-content/70"
					>
						<p class="font-semibold">Auto simulation</p>
						<p>Tags will appear, move, and leave at random. Switch to manual to pin exact tags.</p>
					</div>
				{/if}

				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<p class="text-sm font-semibold">On reader ({inventory.length})</p>
						<button class="btn btn-ghost btn-xs" onclick={refreshState}>
							<SignalHigh class="h-4 w-4" />
							Sync
						</button>
					</div>

					<div class="grid gap-3">
						{#each inventory as item (item.id)}
							<div class="rounded-xl border border-base-200 bg-base-100/80 p-3 shadow-sm">
								<div class="flex items-start justify-between gap-2">
									<div class="min-w-0">
										<p class="truncate text-sm font-semibold">{item.data || 'Untitled tag'}</p>
										<p class="truncate text-[11px] text-base-content/60">{item.id}</p>
									</div>
									<button
										class="btn btn-circle btn-ghost btn-xs"
										onclick={() => removeTag(item.id)}
										aria-label={`Remove ${item.id}`}
									>
										<X class="h-4 w-4" />
									</button>
								</div>

								<div class="mt-2 flex items-center gap-2">
									<input
										type="range"
										class="range range-secondary range-xs"
										min="-80"
										max="-25"
										step="1"
										value={item.rssi ?? -55}
										oninput={(event) => updateRssi(item.id, Number(event.currentTarget.value))}
									/>
									<span class="badge badge-outline badge-sm">{item.rssi ?? 'n/a'}dBm</span>
								</div>

								<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
									<div class="flex items-center gap-2 text-[11px] text-base-content/60">
										<span class={`badge ${getSecurityBadgeClass(item.secured)} badge-sm`}>
											{getSecurityLabel(item.secured)}
										</span>
										<span>Security</span>
									</div>

									<div class="join">
										<button
											class={`btn join-item btn-xs ${item.secured ? 'btn-primary' : 'btn-outline'}`}
											onclick={() => setSecurity(item.id, true)}
											aria-pressed={item.secured === true}
										>
											Secure
										</button>
										<button
											class={`btn join-item btn-xs ${item.secured === false ? 'btn-primary' : 'btn-outline'}`}
											onclick={() => setSecurity(item.id, false)}
											aria-pressed={item.secured === false}
										>
											Unsecure
										</button>
									</div>
								</div>
							</div>
						{:else}
							<div
								class="rounded-xl border border-dashed border-base-200 px-3 py-4 text-center text-xs text-base-content/60"
							>
								<p>No tags on the pad right now.</p>
							</div>
						{/each}
					</div>
				</div>
			</div>
		{/if}
	</div>
</div>
