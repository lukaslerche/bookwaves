<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { setLocale } from '$lib/paraglide/runtime';

	let {
		children,
		data
	}: {
		children: Snippet;
		data: { themeCssVars?: Record<string, string>; themeFontUrl?: string };
	} = $props();

	let themeVarsStyle = $derived(
		Object.entries(data.themeCssVars ?? {})
			.map(([name, value]) => `${name}: ${value}`)
			.join('; ')
	);

	let fontUrl = $derived(data.themeFontUrl ? data.themeFontUrl : '');
	let fontName = $derived(data.themeFontUrl ? 'CustomThemeFont' : '');
	onMount(() => {
		if (!fontUrl) return;

		const style = document.createElement('style');
		style.textContent = `
          @font-face {
            font-family: '${fontName}';
            src: url('${fontUrl}') format('truetype');
          }
        `;
		document.head.appendChild(style);

		document.body.style.fontFamily = fontName;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	{#if fontUrl}
		<link rel="stylesheet" href={fontUrl} />
	{/if}
</svelte:head>

<div class="h-screen overflow-y-auto" style={themeVarsStyle}>
	<div class="fixed bottom-4 left-4 z-50 flex gap-2">
		<button
			class="btn btn-outline"
			onclick={() => setLocale('de')}
			aria-label="Sprache auf Deutsch wechseln">🇩🇪 DE</button
		>
		<button
			class="btn btn-outline"
			onclick={() => setLocale('en')}
			aria-label="Switch language to English">🇬🇧 EN</button
		>
	</div>
	{@render children?.()}
</div>
