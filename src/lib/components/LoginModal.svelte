<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { loginUser } from '$lib/lms/lms.remote';
	import { validateLoginScanRemote } from '$lib/auth/validate.remote';
	import { setAuthUser } from '$lib/stores/auth';
	import { CircleX } from '@lucide/svelte';
	import { clientLogger } from '$lib/client/logger';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import type { LoginHelpImageConfig } from '$lib/types/login';

	type LoginMode =
		| 'username_password'
		| 'username_only'
		| 'scanner_only'
		| 'username_or_scanner'
		| 'username_password_or_pin';

	interface Props {
		onSuccess: () => void;
		onCancel?: () => void;
		loginMode?: LoginMode;
		loginHelpImage?: LoginHelpImageConfig;
	}

	let { onSuccess, onCancel, loginMode = 'username_password', loginHelpImage }: Props = $props();

	const helpImage = $derived.by(() => {
		if (!loginHelpImage) return undefined;
		if (typeof loginHelpImage === 'string') {
			return loginHelpImage;
		}
		return loginHelpImage[getLocale()];
	});

	const requiresLoginSecret = $derived(
		loginMode === 'username_password' || loginMode === 'username_password_or_pin'
	);
	const loginSecretLabel = $derived(
		loginMode === 'username_password_or_pin' ? `${m.password()} / PIN` : m.password()
	);
	const missingLoginSecretMessage = $derived(
		loginMode === 'username_password_or_pin'
			? m.please_enter_a_password_or_pin()
			: m.please_enter_a_password()
	);
	const hasCameraToggle = $derived(loginMode === 'username_or_scanner');
	const scannerOnlyMode = $derived(loginMode === 'scanner_only');
	const supportsScanner = $derived(hasCameraToggle || scannerOnlyMode);
	let username = $state('');
	let loginSecret = $state('');
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
	const loginSecretInputId = 'login-secret';
	const scannerElementId = 'login-qr-reader';
	const handleCancel = () => {
		void stopScanner();
		onCancel?.();
	};
	// --- Re-scan detection in password field ----------------------------------
	// A scanner types the whole barcode + Tab in < 100 ms. If we see Tab arrive
	// in the password field right after a series of characters, treat it as a
	// second scan by a different patron: clear password, move the barcode to
	// username, and refocus username.
	let lastCharTime = 0;
	let prevCharTime = 0;

	function handlePasswordKeydown(e: KeyboardEvent) {
		if (e.key === 'Tab' || e.key === 'Enter') {
			const charInterval = lastCharTime - prevCharTime;
			if (charInterval >= 0 && charInterval < 30 && password.length > 3) {
				e.preventDefault();
				username = password;
				password = '';
				errorMessage = '';
				const usernameInput = document.getElementById(
					usernameInputId
				) as HTMLInputElement | null;
				usernameInput?.focus();
				usernameInput?.select();
			}
		} else if (e.key.length === 1) {
			prevCharTime = lastCharTime;
			lastCharTime = Date.now();
		}
	}
	let cleanupRefocus: (() => void) | null = null;
	onMount(() => {
		if (scannerOnlyMode) {
			void startScanner();
			return;
		}

		const usernameInput = document.getElementById(usernameInputId) as HTMLInputElement | null;
		usernameInput?.focus();
		usernameInput?.select();

      // Refocus username when focus is lost — helps barcode scanner in kiosk mode
		const refocusUsername = () => {
			setTimeout(() => {
				const active = document.activeElement;
				const isInputOrButton = active && (active.tagName === 'INPUT' || active.tagName === 'BUTTON' || active.tagName === 'TEXTAREA');
				if (!isInputOrButton) {
					usernameInput?.focus();
					usernameInput?.select();
				}
			}, 100);
		
		};

		document.addEventListener('click', refocusUsername);
		document.addEventListener('touchend', refocusUsername);

		cleanupRefocus = () => {
        	document.removeEventListener('click', refocusUsername);
        	document.removeEventListener('touchend', refocusUsername);
      };
		
	});

	onDestroy(() => {
		cleanupRefocus?.();
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
			const validatedUsername = await validateLoginScanRemote(normalized);
			if (!validatedUsername) {
				errorMessage = 'Scanned code could not be validated.';
				if (scannerOnlyMode) {
					void startScanner();
				}
				return;
			}

			username = validatedUsername;
			await stopScanner();

			if (requiresLoginSecret) {
				await tick();
				const loginSecretInput = document.getElementById(
					loginSecretInputId
				) as HTMLInputElement | null;
				loginSecretInput?.focus();
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

		if (requiresLoginSecret && !loginSecret) {
			errorMessage = missingLoginSecretMessage;
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
			const payload = requiresLoginSecret
				? { user: normalizedUsername, loginSecret }
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

<div class="modal-open modal" style="place-items: start center; padding-top: 3rem;">
	<div
		class="modal-box max-w-4xl rounded-3xl bg-base-100/95 text-base-content shadow-2xl ring-1 ring-base-300/70"
	>
		<div class="flex flex-col gap-6 md:flex-row md:items-stretch">
			{#if helpImage}
				<div class="md:w-72 md:shrink-0">
					<img
						src={helpImage}
						alt={m.login_required()}
						class="h-full w-full rounded-2xl object-cover shadow-xl"
					/>
				</div>
			{/if}

			<div class="min-w-0 flex-1">
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
							class="input-bordered input w-full input-lg"
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

					{#if requiresLoginSecret}
						<div class="form-control gap-2">
							<label class="label" for={loginSecretInputId}>
								<span class="label-text text-sm font-semibold">{loginSecretLabel}</span>
							</label>
							<input
								id={loginSecretInputId}
								type="password"
								autocomplete="current-password"
								class="input-bordered input w-full input-lg"
								bind:value={loginSecret}
								disabled={isLoading}
								onkeydown={handlePasswordKeydown}
								onfocus={(e) => (e.target as HTMLInputElement).click()}
							/>
						</div>
					{/if}

					<div class="modal-action mt-8 flex items-center justify-end gap-3">
						<button
							type="button"
							class="btn btn-ghost px-5"
							onclick={handleCancel}
							disabled={isLoading}
						>
							{m.cancel()}
						</button>
						{#if !scannerOnlyMode}
							<button class="btn px-6 btn-accent btn-lg" type="submit" disabled={isLoading}>
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
	</div>
</div>
