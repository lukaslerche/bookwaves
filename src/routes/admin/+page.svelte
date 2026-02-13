<script lang="ts">
	import ReaderSelector from '$lib/components/ReaderSelector.svelte';
	import { getSelectedReaderConfig } from '$lib/stores/reader-selection';
	import type { PageProps } from './$types';
	import { Info } from '@lucide/svelte';
	import { onMount } from 'svelte';
	import type { MediaItem } from '$lib/lms/lms';
	import * as lms from '$lib/lms/lms.remote';
	import { clientLogger } from '$lib/client/logger';

	let { data }: PageProps = $props();
	let currentSelection = $state<{ middleware: string; reader: string } | null>(null);
	let username = $state('');
	let password = $state('');
	let loginStatus = $state('');
	let accountResult = $state('');
	let mediaId = $state('');
	let mediaResult = $state<MediaItem | null>(null);
	let lendResult = $state('');
	let returnResult = $state('');
	let testResult = $state('');
	let feesResult = $state<number | null>(null);
	let busyAction = $state<string | null>(null);
	let library = $state('');
	let circDesk = $state('');

	onMount(() => {
		currentSelection = getSelectedReaderConfig();
		library = data.checkoutProfiles?.[0]?.library ?? '';
		circDesk = data.checkoutProfiles?.[0]?.circulation_desk ?? '';
	});

	async function run<T>(actionLabel: string, fn: () => Promise<T>): Promise<T | null> {
		busyAction = actionLabel;
		try {
			return await fn();
		} catch (error) {
			clientLogger.error(error);
			return null;
		} finally {
			busyAction = null;
		}
	}

	const handleLogin = async () => {
		await run('login', async () => {
			const ok = await lms.loginUser({ user: username, password: password || undefined });
			loginStatus = ok ? `Logged in as ${username}` : 'Login failed';
		});
	};

	const handleLogout = async () => {
		await run('logout', async () => {
			await lms.logoutUser();
			loginStatus = 'Logged out';
			accountResult = '';
			mediaResult = null;
			lendResult = '';
			returnResult = '';
			testResult = '';
			feesResult = null;
		});
	};

	const handleAccount = async () => {
		await run('account', async () => {
			try {
				const account = await lms.getAccount();
				accountResult = JSON.stringify(account, null, 2);
			} catch (error) {
				clientLogger.error(error);
				accountResult = 'Error fetching account';
			}
		});
	};

	const handleMediaLookup = async () => {
		await run('media', async () => {
			mediaResult = await lms.getItem(mediaId);
		});
	};

	const handleLend = async () => {
		await run('lend', async () => {
			const result = await lms.borrowItem({
				barcode: mediaId,
				context: { library, circDesk }
			});
			if (result.ok) {
				const title = result.item?.title || result.item?.barcode || mediaId;
				lendResult = `Lend succeeded${title ? `: ${title}` : ''}`;
			} else {
				const details = result.errors?.length ? ` (${result.errors.join('; ')})` : '';
				lendResult = `Lend failed: ${result.reason}${details}`;
			}
		});
	};

	const handleReturn = async () => {
		await run('return', async () => {
			const result = await lms.returnItem({
				barcode: mediaId,
				context: { library, circDesk }
			});
			if (result.ok) {
				const title = result.item?.title || result.item?.barcode || mediaId;
				returnResult = `Return succeeded${title ? `: ${title}` : ''}`;
			} else {
				const details = result.errors?.length ? ` (${result.errors.join('; ')})` : '';
				returnResult = `Return failed: ${result.reason}${details}`;
			}
		});
	};

	const handleTestApi = async () => {
		await run('test', async () => {
			const ok = await lms.getHealth();
			testResult = ok.result
				? 'LMS reachable'
				: `LMS unreachable: ${ok.reason || 'unknown reason'}`;
		});
	};

	function handleSelectionChange(event: CustomEvent<{ middlewareId: string; readerName: string }>) {
		currentSelection = {
			middleware: event.detail.middlewareId,
			reader: event.detail.readerName
		};
	}
</script>

<div class="app-page-bg-admin min-h-full p-8">
	<div class="mx-auto max-w-5xl">
		<h1 class="mb-8 text-4xl font-bold">Admin</h1>

		<div class="grid gap-6">
			<div class="card bg-base-100 shadow-xl">
				<div class="card-body">
					<h2 class="card-title text-2xl">System Configuration</h2>

					<div class="mt-4 space-y-6">
						<!-- LMS Configuration -->
						<div>
							<h3 class="mb-2 text-xl font-semibold">LMS Configuration</h3>
							<div class="rounded-lg bg-base-200 p-4">
								<div class="grid grid-cols-2 gap-2">
									<div class="font-semibold">Type:</div>
									<div>{data.lmsType}</div>
									<div class="font-semibold">API Key:</div>
									<div class="font-mono text-sm">
										{data.lmsApiKeyMasked}
									</div>
								</div>
							</div>
						</div>

						<!-- Middleware Instances & Readers -->
						<div>
							<h3 class="mb-2 text-xl font-semibold">Middleware Instances & Readers</h3>
							<ReaderSelector
								middlewareReaders={data.middlewareReaders}
								variant="detailed"
								on:change={handleSelectionChange}
							/>
						</div>

						{#if currentSelection}
							<div class="alert alert-info">
								<Info />
								<span>
									<strong>Currently selected:</strong>
									{currentSelection.middleware} - {currentSelection.reader}
								</span>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<div class="card bg-base-100 shadow-xl">
				<div class="card-body space-y-6">
					<div class="flex items-center justify-between gap-3">
						<div>
							<h2 class="card-title text-2xl">LMS Test Console</h2>
							<p class="text-sm text-base-content/70">
								Exercise the currently configured LMS endpoints directly from the admin area.
							</p>
						</div>
						{#if busyAction}
							<div class="badge badge-lg badge-info">{busyAction}…</div>
						{/if}
					</div>

					<div class="grid gap-6 lg:grid-cols-2">
						<div class="space-y-4">
							<div class="rounded-lg border border-base-200 bg-base-200/50 p-4">
								<h3 class="mb-3 text-lg font-semibold">Session</h3>
								<label class="form-control w-full">
									<span class="label-text font-semibold">Username</span>
									<input
										type="text"
										bind:value={username}
										aria-label="Username"
										class="input-bordered input w-full"
									/>
								</label>
								<label class="form-control w-full">
									<span class="label-text font-semibold">Password (optional)</span>
									<input
										type="password"
										bind:value={password}
										aria-label="Password"
										class="input-bordered input w-full"
									/>
								</label>
								<div class="mt-2 flex flex-wrap gap-3">
									<button class="btn btn-primary" onclick={handleLogin} disabled={!!busyAction}
										>Login</button
									>
									<button class="btn" onclick={handleLogout} disabled={!!busyAction}>Logout</button>
									{#if loginStatus}
										<span class="text-sm font-semibold text-success">{loginStatus}</span>
									{/if}
								</div>
							</div>

							<div class="rounded-lg border border-base-200 bg-base-200/50 p-4">
								<h3 class="mb-3 text-lg font-semibold">Account</h3>
								<button class="btn btn-secondary" onclick={handleAccount} disabled={!!busyAction}
									>Get Account</button
								>
								{#if accountResult}
									<pre
										class="mt-3 max-h-64 overflow-auto rounded-lg bg-base-300/80 p-3 text-sm">{accountResult}</pre>
								{/if}
							</div>
						</div>

						<div class="space-y-4">
							<div class="rounded-lg border border-base-200 bg-base-200/50 p-4">
								<h3 class="mb-3 text-lg font-semibold">Items</h3>
								<label class="form-control w-full">
									<span class="label-text font-semibold">Media / barcode</span>
									<input
										type="text"
										bind:value={mediaId}
										aria-label="Media id"
										class="input-bordered input w-full"
									/>
								</label>
								<div class="mt-2 grid gap-3 sm:grid-cols-2">
									<label class="form-control w-full">
										<span class="label-text font-semibold">Library</span>
										<input
											type="text"
											bind:value={library}
											aria-label="Library"
											class="input-bordered input w-full"
										/>
									</label>
									<label class="form-control w-full">
										<span class="label-text font-semibold">Circulation desk</span>
										<input
											type="text"
											bind:value={circDesk}
											aria-label="Circulation desk"
											class="input-bordered input w-full"
										/>
									</label>
								</div>
								<div class="mt-2 flex flex-wrap gap-3">
									<button class="btn btn-accent" onclick={handleMediaLookup} disabled={!!busyAction}
										>Lookup</button
									>
									<button class="btn btn-success" onclick={handleLend} disabled={!!busyAction}
										>Lend</button
									>
									<button class="btn btn-warning" onclick={handleReturn} disabled={!!busyAction}
										>Return</button
									>
								</div>
								{#if mediaResult}
									<pre
										class="mt-3 max-h-64 overflow-auto rounded-lg bg-base-300/80 p-3 text-sm">{JSON.stringify(
											mediaResult,
											null,
											2
										)}</pre>
								{/if}
								{#if lendResult}
									<p class="text-sm font-semibold text-success">{lendResult}</p>
								{/if}
								{#if returnResult}
									<p class="text-sm font-semibold text-success">{returnResult}</p>
								{/if}
							</div>

							<div class="rounded-lg border border-base-200 bg-base-200/50 p-4">
								<h3 class="mb-3 text-lg font-semibold">Utilities</h3>
								<div class="flex flex-wrap gap-3">
									<button class="btn btn-info" onclick={handleTestApi} disabled={!!busyAction}
										>Test LMS API</button
									>
								</div>
								{#if testResult}
									<p class="mt-2 text-sm font-semibold text-success">{testResult}</p>
								{/if}
								{#if feesResult !== null}
									<p class="mt-1 text-sm font-semibold text-success">Fees: {feesResult}</p>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</div>
