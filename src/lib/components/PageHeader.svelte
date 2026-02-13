<script lang="ts">
	import { page } from '$app/state';
	import logo from '$lib/assets/logo.png';

	interface Props {
		title: string;
		subtitle?: string;
		showLogo?: boolean;
		variant?: 'default' | 'compact';
	}

	let { title, subtitle, showLogo = false, variant = 'default' }: Props = $props();

	let themedLogo = $derived(
		(page.data as { themeLogoUrl?: string | null } | undefined)?.themeLogoUrl
	);
	let resolvedLogo = $derived(themedLogo || logo);
</script>

<header class="mb-12 text-center text-white">
	{#if showLogo}
		<div class="mb-6 flex justify-center">
			<img src={resolvedLogo} alt="BookWaves Logo" class="h-24 drop-shadow-2xl" />
		</div>
	{/if}
	<h1
		class="mb-4 font-bold tracking-tight drop-shadow-lg {variant === 'compact'
			? 'text-4xl'
			: 'text-5xl md:text-6xl'}"
	>
		{title}
	</h1>
	{#if subtitle}
		<p class="text-xl font-medium opacity-95">
			{subtitle}
		</p>
	{/if}
</header>
