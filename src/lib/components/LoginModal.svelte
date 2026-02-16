<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { loginUser } from '$lib/lms/lms.remote';
	import { setAuthUser } from '$lib/stores/auth';
	import { CircleX } from '@lucide/svelte';
	import { clientLogger } from '$lib/client/logger';
	import { m } from '$lib/paraglide/messages';

	type LoginMode = 'username_password' | 'username_only';

	interface Props {
		onSuccess: () => void;
		onCancel?: () => void;
		loginMode?: LoginMode;
	}

	let { onSuccess, onCancel, loginMode = 'username_password' }: Props = $props();

	const requiresPassword = $derived(loginMode !== 'username_only');
	let username = $state('');
	let password = $state('');
	let isLoading = $state(false);
	let errorMessage = $state('');
	let usernameInput = $state<HTMLInputElement | null>(null);
	let passwordInput = $state<HTMLInputElement | null>(null);
	let scannerOpen = $state(false);
	let scannerStatus = $state<'idle' | 'starting' | 'scanning' | 'error'>('idle');
	let scannerError = $state('');
	let scannerInstance: import('html5-qrcode').Html5Qrcode | null = null;
	const scannerElementId = 'login-qr-reader';
	const handleCancel = () => {
		void stopScanner();
		onCancel?.();
	};

	onMount(() => {
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
			scannerOpen = false;
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

		username = normalized;
		await stopScanner();

		if (requiresPassword) {
			await tick();
			passwordInput?.focus();
			return;
		}

		void handleSubmit();
	}

	async function handleSubmit(event?: Event) {
		event?.preventDefault();

		const normalizedUsername = username.trim();

		if (!normalizedUsername) {
			errorMessage = 'Please enter a username';
			return;
		}

		if (requiresPassword && !password) {
			errorMessage = 'Please enter a password';
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
				errorMessage = 'Login failed. Please try again.';
			}
		} catch (error) {
			errorMessage = 'An error occurred. Please try again.';
			clientLogger.error('Login error:', error);
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
				<div
					class="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary uppercase"
				>
					<span>{requiresPassword ? m.username_password() : m.usename_only()}</span>
				</div>
				<h3 class="text-3xl leading-tight font-black">{m.login_required()}</h3>
				<p class="mt-2 text-base-content/70">
					{requiresPassword ? m.username_password_description() : m.password_only_description()}
				</p>
			</div>
			<div
				class="rounded-2xl bg-base-200/70 px-3 py-2 text-xs font-semibold tracking-wide text-base-content/70 uppercase"
			>
				{m.hid_ready()}
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
					id="username"
					type="text"
					inputmode="text"
					autocomplete="username"
					placeholder={m.scan_or_type_your_username()}
					class="input-bordered input input-lg w-full"
					bind:this={usernameInput}
					bind:value={username}
					disabled={isLoading}
				/>
				<p class="text-xs text-base-content/60">
					{m.focused_for_text()}
				</p>
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
						<span class="text-xs text-base-content/60"> m.point_the_camera() </span>
					{/if}
				</div>
				{#if scannerOpen}
					<div class="mt-4 rounded-2xl border border-base-300 bg-base-200/40 p-4">
						<div class="text-[0.7rem] font-semibold tracking-wide text-base-content/60 uppercase">
							{m.camera_scanner()}
						</div>
						<div id={scannerElementId} class="mt-3 overflow-hidden rounded-xl"></div>
						{#if scannerError}
							<p class="mt-3 text-xs text-error">{scannerError}</p>
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
						id="password"
						type="password"
						autocomplete="current-password"
						placeholder={m.enter_your_password()}
						class="input-bordered input input-lg w-full"
						bind:value={password}
						bind:this={passwordInput}
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
				<button class="btn px-6 btn-lg btn-primary" type="submit" disabled={isLoading}>
					{#if isLoading}
						<span class="loading loading-spinner"></span>
						{m.logging_in()}...
					{:else}
						{m.login()}
					{/if}
				</button>
			</div>
		</form>
	</div>
</div>
