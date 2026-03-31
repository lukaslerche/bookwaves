<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { Snippet } from 'svelte';
	import { setLocale } from '$lib/paraglide/runtime';

	let {
		children,
		data
	}: {
		children: Snippet;
		data: { themeCssVars?: Record<string, string> };
	} = $props();

	let themeVarsStyle = $derived(
		Object.entries(data.themeCssVars ?? {})
			.map(([name, value]) => `${name}: ${value}`)
			.join('; ')
	);
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="h-screen overflow-y-auto" style={themeVarsStyle}>
	<div class="fixed top-4 right-4 z-50 flex gap-2">
		<button class="btn" onclick={() => setLocale('en')} aria-label="Switch language to English">🇬🇧 EN</button>
		<button class="btn" onclick={() => setLocale('de')} aria-label="Sprache auf Deutsch wechseln">🇩🇪 DE</button>
	</div>
	{@render children?.()}
</div>
