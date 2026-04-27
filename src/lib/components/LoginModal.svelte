<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { loginUser } from '$lib/lms/lms.remote';
	import { setAuthUser } from '$lib/stores/auth';
	import { CircleX } from '@lucide/svelte';
	import { clientLogger } from '$lib/client/logger';
	import { m } from '$lib/paraglide/messages';

	type LoginMode = 'username_password' | 'username_only' | 'scanner_only' | 'username_or_scanner';

	interface Props {
		onSuccess: () => void;
		onCancel?: () => void;
		loginMode?: LoginMode;
	}

	let { onSuccess, onCancel, loginMode = 'username_password' }: Props = $props();

	const requiresPassword = $derived(loginMode === 'username_password');
	const hasCameraToggle = $derived(loginMode === 'username_or_scanner');
	const scannerOnlyMode = $derived(loginMode === 'scanner_only');
	const supportsScanner = $derived(hasCameraToggle || scannerOnlyMode);
	let username = $state('');
	let password = $state('');
	let isLoading = $state(false);
	let errorMessage = $state('');
	let scannerOpen = $state(false);
	let scannerStatus = $state<'idle' | 'starting' | 'scanning' | 'error'>('idle');
	let scannerError = $state('');
	let isHandlingScan = $state(false);
	let lastScannedCode = $state('');
	let lastScannedAt = $state(0);
	let scannerInstance: import('html5-qrcode').Html5Qrcode | null = null;
	const SCAN_DUPLICATE_COOLDOWN_MS = 2500;
	const usernameInputId = 'username';
	const passwordInputId = 'password';
	const scannerElementId = 'login-qr-reader';
	const handleCancel = () => {
		void stopScanner();
		onCancel?.();
	};

	onMount(() => {
		if (scannerOnlyMode) {
			void startScanner();
			return;
		}

		const usernameInput = document.getElementById(usernameInputId) as HTMLInputElement | null;
		usernameInput?.focus();
		usernameInput?.select();
	});

	onDestroy(() => {
		void stopScanner();
	});

	async function startScanner() {
		if (scannerStatus === 'starting' || scannerStatus === 'scanning') return;

		scannerError = '';
		scannerStatus = 'starting';
		scannerOpen = true;

		try {
			await tick();
			const { Html5Qrcode } = await import('html5-qrcode');
			scannerInstance = scannerInstance ?? new Html5Qrcode(scannerElementId);

			await scannerInstance.start(
				{ facingMode: 'environment' },
				{ fps: 10, qrbox: { width: 220, height: 220 } },
				handleScanSuccess,
				() => {}
			);

			scannerStatus = 'scanning';
		} catch (error) {
			scannerStatus = 'error';
			scannerOpen = scannerOnlyMode;
			scannerError = 'Unable to start the camera scanner.';
			clientLogger.error('Scanner start error:', error);
		}
	}

	async function stopScanner() {
		try {
			if (!scannerInstance) {
				scannerOpen = false;
				scannerStatus = 'idle';
				return;
			}

			if (scannerStatus === 'scanning' || scannerStatus === 'starting') {
				await scannerInstance.stop();
			}

			await scannerInstance.clear();
		} catch (error) {
			clientLogger.error('Scanner stop error:', error);
		} finally {
			scannerOpen = false;
			scannerStatus = 'idle';
		}
	}

	async function handleScanSuccess(decodedText: string) {
		const normalized = decodedText.trim();
		if (!normalized) return;
		if (isLoading || isHandlingScan) return;

		const now = Date.now();
		if (normalized === lastScannedCode && now - lastScannedAt < SCAN_DUPLICATE_COOLDOWN_MS) {
			return;
		}

		isHandlingScan = true;
		lastScannedCode = normalized;
		lastScannedAt = now;

		try {
			username = normalized;
			await stopScanner();

			if (requiresPassword) {
				await tick();
				const passwordInput = document.getElementById(passwordInputId) as HTMLInputElement | null;
				passwordInput?.focus();
				return;
			}

			await handleSubmit();
		} finally {
			isHandlingScan = false;
		}
	}

	async function handleSubmit(event?: Event) {
		event?.preventDefault();
		if (isLoading) return;

		const normalizedUsername = username.trim();
		const shouldAutoRestartScanner = scannerOnlyMode;

		if (!normalizedUsername) {
			errorMessage = m.please_enter_a_username();
			if (shouldAutoRestartScanner) {
				void startScanner();
			}
			return;
		}

		if (requiresPassword && !password) {
			errorMessage = m.please_enter_a_password();
			if (shouldAutoRestartScanner) {
				void startScanner();
			}
			return;
		}

		isLoading = true;
		errorMessage = '';

		try {
			if (scannerOpen) {
				await stopScanner();
			}
			const payload = requiresPassword
				? { user: normalizedUsername, password }
				: { user: normalizedUsername };
			const success = await loginUser(payload);

			if (success) {
				setAuthUser(normalizedUsername);
				onSuccess();
			} else {
				errorMessage = m.login_failed_please_try_again();
				lastScannedCode = normalizedUsername;
				lastScannedAt = Date.now();
				if (shouldAutoRestartScanner) {
					void startScanner();
				}
			}
		} catch (error) {
			errorMessage = m.an_error_occurred_please_try_again();
			clientLogger.error('Login error:', error);
			lastScannedCode = normalizedUsername;
			lastScannedAt = Date.now();
			if (shouldAutoRestartScanner) {
				void startScanner();
			}
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="modal-open modal">
	<div
		class="modal-box max-w-xl rounded-3xl bg-base-100/95 text-base-content shadow-2xl ring-1 ring-base-300/70"
	>
		<div class="flex items-start justify-between gap-3">
			<div>
				<h3 class="text-3xl leading-tight font-black">{m.login_required()}</h3>
			</div>
		</div>

		{#if errorMessage}
			<div class="mt-4 rounded-2xl border border-error/30 bg-error/10 px-4 py-3 text-error">
				<div class="flex items-center gap-3">
					<CircleX />
					<span>{errorMessage}</span>
				</div>
			</div>
		{/if}

		<form class="mt-6 space-y-5" onsubmit={handleSubmit}>
			<div class="form-control gap-2">
				<label class="label" for="username">
					<span class="label-text text-sm font-semibold">{m.username()} / Barcode</span>
				</label>
				<input
					id={usernameInputId}
					type="text"
					inputmode="text"
					autocomplete="username"
					class="input-bordered input input-lg w-full"
					bind:value={username}
					readonly={scannerOnlyMode}
					disabled={isLoading}
				/>
				{#if hasCameraToggle}
					<div class="flex flex-wrap items-center gap-3">
						<button
							type="button"
							class="btn btn-outline btn-sm"
							disabled={isLoading || scannerStatus === 'starting'}
							onclick={() => (scannerOpen ? stopScanner() : startScanner())}
						>
							{scannerOpen ? m.stop_camera() : m.start_with_camera()}
						</button>
						{#if scannerStatus === 'scanning'}
							<span class="text-xs text-base-content/60"> {m.point_the_camera()} </span>
						{/if}
					</div>
				{:else if scannerOnlyMode && scannerStatus === 'scanning'}
					<span class="text-xs text-base-content/60"> {m.point_the_camera()} </span>
				{/if}
				{#if supportsScanner && (scannerOpen || scannerOnlyMode)}
					<div class="mt-4 rounded-2xl border border-base-300 bg-base-200/40 p-4">
						<div id={scannerElementId} class="overflow-hidden rounded-xl"></div>
						{#if scannerError}
							<p class="mt-3 text-xs text-error">{scannerError}</p>
							{#if scannerOnlyMode}
								<button
									type="button"
									class="btn mt-3 btn-outline btn-xs"
									disabled={isLoading || scannerStatus === 'starting'}
									onclick={startScanner}
								>
									{m.start_with_camera()}
								</button>
							{/if}
						{/if}
					</div>
				{/if}
			</div>

			{#if requiresPassword}
				<div class="form-control gap-2">
					<label class="label" for="password">
						<span class="label-text text-sm font-semibold">{m.password()} / PIN</span>
					</label>
					<input
						id={passwordInputId}
						type="password"
						autocomplete="current-password"
						class="input-bordered input input-lg w-full"
						bind:value={password}
						disabled={isLoading}
					/>
				</div>
			{/if}

			<div class="modal-action mt-8 flex items-center justify-end gap-3">
				<button
					type="button"
					class="btn px-5 btn-ghost"
					onclick={handleCancel}
					disabled={isLoading}
				>
					{m.cancel()}
				</button>
				{#if !scannerOnlyMode}
					<button class="btn px-6 btn-lg btn-accent" type="submit" disabled={isLoading}>
						{#if isLoading}
							<span class="loading loading-spinner"></span>
							{m.logging_in()}...
						{:else}
							{m.login()}
						{/if}
					</button>
				{/if}
			</div>
		</form>
	</div>
</div>
