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

	let { middlewareReaders = [] }: { middlewareReaders: MiddlewareReaders[] } = $props();

	const dispatch = createEventDispatcher<{
		change: { middlewareId: string; readerName: string };
	}>();

	let selectedMiddleware = $state('');
	let selectedReader = $state('');
	let readerFilter = $state('');

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
	});

	const currentMiddleware = $derived(
		middlewareReaders.find((m) => m.instance.id === selectedMiddleware)
	);
	const currentReader = $derived(
		currentMiddleware?.readers.find((reader) => reader.name === selectedReader)
	);
	// The selected reader stays listed even when it doesn't match the filter,
	// so the select never shows a reader other than the selected one.
	const visibleReaders = $derived(
		currentMiddleware?.readers.filter(
			(reader) =>
				reader.name === selectedReader ||
				reader.name.toLowerCase().includes(readerFilter.trim().toLowerCase())
		) ?? []
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
</script>

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
			class="select-bordered select bg-white/20 text-white select-xs"
			bind:value={selectedMiddleware}
			onchange={(event) => handleMiddlewareSelect(event.currentTarget.value)}
		>
			{#each middlewareReaders as middleware (middleware.instance.id)}
				<option value={middleware.instance.id}>
					{middleware.instance.id} ({middleware.instance.type})
				</option>
			{/each}
		</select>

		<input
			type="search"
			class="input-bordered input bg-white/20 text-white input-xs"
			bind:value={readerFilter}
			placeholder={m.filter_readers()}
			disabled={!currentMiddleware?.readers.length}
		/>

		<select
			class="select-bordered select bg-white/20 text-white select-xs"
			bind:value={selectedReader}
			onchange={(event) => handleReaderSelect(event.currentTarget.value)}
			disabled={!currentMiddleware?.readers.length}
		>
			{#each visibleReaders as reader (reader.name)}
				<option value={reader.name}>{reader.name}</option>
			{:else}
				<option value="">{m.no_readers()}</option>
			{/each}
		</select>

		{#if currentReader}
			<span class="badge badge-sm {currentReader.isConnected ? 'badge-success' : 'badge-error'}">
				{currentReader.isConnected ? m.connected() : m.offline()}
			</span>
		{/if}
	</div>
</div>
