<script lang="ts">
	import { createEventDispatcher, onMount } from 'svelte';
	import type { ReaderInfo } from '$lib/reader/interface';
	import type { MiddlewareInstanceConfig } from '$lib/server/config';
	import { getSelectedReaderConfig, setSelectedReaderConfig } from '$lib/stores/reader-selection';
	import { Cpu } from '@lucide/svelte';
	import { m } from '$lib/paraglide/messages';

	type MiddlewareReaders = {
		instance: MiddlewareInstanceConfig;
		readers: ReaderInfo[];
	};

	let {
		middlewareReaders = [],
		variant = 'inline'
	}: { middlewareReaders: MiddlewareReaders[]; variant?: 'inline' | 'detailed' } = $props();

	const dispatch = createEventDispatcher<{
		change: { middlewareId: string; readerName: string };
	}>();

	let selectedMiddleware = $state('');
	let selectedReader = $state('');
	let initialized = $state(false);

	onMount(() => {
		const saved = getSelectedReaderConfig();

		if (saved && middlewareReaders.some((m) => m.instance.id === saved.middleware)) {
			selectedMiddleware = saved.middleware;
			const savedReaders = middlewareReaders.find(
				(m) => m.instance.id === saved.middleware
			)?.readers;
			if (savedReaders?.some((reader) => reader.name === saved.reader)) {
				selectedReader = saved.reader;
			}
		}

		if (!selectedMiddleware && middlewareReaders[0]) {
			selectedMiddleware = middlewareReaders[0].instance.id;
		}

		syncReaderForMiddleware();
		const selectionChanged =
			!saved || saved.middleware !== selectedMiddleware || saved.reader !== selectedReader;

		applySelection(selectionChanged);
		initialized = true;
	});

	const currentMiddleware = $derived(
		middlewareReaders.find((m) => m.instance.id === selectedMiddleware)
	);
	const currentReader = $derived(
		currentMiddleware?.readers.find((reader) => reader.name === selectedReader)
	);

	function syncReaderForMiddleware() {
		if (!currentMiddleware) {
			selectedReader = '';
			return;
		}

		if (!currentMiddleware.readers.some((reader) => reader.name === selectedReader)) {
			selectedReader = currentMiddleware.readers[0]?.name ?? '';
		}
	}

	$effect(() => {
		if (!initialized) return;
		syncReaderForMiddleware();
	});

	function applySelection(emit = true) {
		if (!selectedMiddleware || !selectedReader) return;
		setSelectedReaderConfig(selectedMiddleware, selectedReader);
		if (emit) {
			dispatch('change', { middlewareId: selectedMiddleware, readerName: selectedReader });
		}
	}

	function handleMiddlewareSelect(middlewareId: string) {
		selectedMiddleware = middlewareId;
		syncReaderForMiddleware();
		applySelection(true);
	}

	function handleReaderSelect(readerName: string) {
		selectedReader = readerName;
		applySelection(true);
	}

	function handleSelection(middlewareId: string, readerName: string) {
		selectedMiddleware = middlewareId;
		selectedReader = readerName;
		applySelection(true);
	}
</script>

{#if variant === 'inline'}
	<div
		class="flex flex-wrap items-center gap-3 rounded-lg bg-white/10 px-4 py-3 text-white backdrop-blur"
	>
		<div class="flex items-center gap-2">
			<Cpu />
			<div>
				<div class="text-xs uppercase opacity-70">{m.reader()}</div>
				<div class="text-sm font-semibold">
					{selectedMiddleware && selectedReader
						? `${selectedMiddleware} / ${selectedReader}`
						: m.no_selection()}
				</div>
				{#if currentMiddleware}
					<div class="text-[11px] opacity-70">
						{currentMiddleware.instance.type} middleware
					</div>
				{/if}
			</div>
		</div>

		<div class="flex flex-wrap items-center gap-2">
			<select
				class="select-bordered select bg-white/20 select-xs text-white"
				bind:value={selectedMiddleware}
				onchange={(event) => handleMiddlewareSelect(event.currentTarget.value)}
			>
				{#each middlewareReaders as middleware}
					<option value={middleware.instance.id}>
						{middleware.instance.id} ({middleware.instance.type})
					</option>
				{/each}
			</select>

			<select
				class="select-bordered select bg-white/20 select-xs text-white"
				bind:value={selectedReader}
				onchange={(event) => handleReaderSelect(event.currentTarget.value)}
				disabled={!currentMiddleware || currentMiddleware.readers.length === 0}
			>
				{#if currentMiddleware?.readers.length}
					{#each currentMiddleware.readers as reader}
						<option value={reader.name}>
							{reader.name} — {reader.mode}
						</option>
					{/each}
				{:else}
					<option value="">{m.no_readers()}</option>
				{/if}
			</select>

			{#if currentReader}
				<span class="badge badge-sm {currentReader.isConnected ? 'badge-success' : 'badge-error'}">
					{currentReader.isConnected ? m.connected() : m.offline()}
				</span>
			{/if}
		</div>
	</div>
{:else}
	<div class="space-y-4">
		{#each middlewareReaders as middlewareData}
			{@const instance = middlewareData.instance}
			{@const readers = middlewareData.readers}
			<div class="rounded-lg bg-base-200 p-4">
				<div class="mb-3 grid grid-cols-2 gap-2 border-b border-base-300 pb-3">
					<div class="font-semibold">Middleware ID:</div>
					<div>{instance.id}</div>
					<div class="font-semibold">Type:</div>
					<div>{instance.type}</div>
					<div class="font-semibold">URL:</div>
					<div class="font-mono text-sm">{instance.url}</div>
				</div>

				<div class="mt-3">
					<h4 class="mb-2 text-sm font-semibold">{m.readers()}:</h4>
					{#if readers.length === 0}
						<div class="text-sm text-base-content/60 italic">{m.no_readers_available()}</div>
					{:else}
						<div class="space-y-2">
							{#each readers as reader}
								{@const antennaCount = reader.antennas?.length ?? 0}
								<label
									class="flex cursor-pointer items-center gap-3 rounded-md border border-base-300 bg-base-100 p-3 transition-colors hover:bg-base-200/50"
								>
									<input
										type="radio"
										name={`reader-${instance.id}`}
										class="radio radio-sm"
										value={reader.name}
										checked={selectedMiddleware === instance.id && selectedReader === reader.name}
										onchange={() => handleSelection(instance.id, reader.name)}
									/>
									<div class="flex-1">
										<div class="flex items-center gap-2">
											<span class="font-medium">{reader.name}</span>
											<span class="badge badge-sm">{reader.mode}</span>
											<span
												class={`inline-block h-2 w-2 rounded-full ${reader.isConnected ? 'bg-success' : 'bg-error'}`}
												title={reader.isConnected ? m.connected() : m.offline()}
											></span>
										</div>
										<div class="mt-1 text-xs text-base-content/60">
											{reader.address}:{reader.port} | {antennaCount} antenna{antennaCount !== 1
												? 's'
												: ''}
											{#if reader.antennas?.length}
												<span class="ml-1">({reader.antennas.join(', ')})</span>
											{/if}
										</div>
									</div>
								</label>
							{/each}
						</div>
					{/if}
				</div>
			</div>
		{/each}
	</div>
{/if}
