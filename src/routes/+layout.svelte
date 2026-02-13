<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { Snippet } from 'svelte';

	let { children, data }: { children: Snippet; data: { themeCssVars?: Record<string, string> } } =
		$props();

	let themeVarsStyle = $derived(
		Object.entries(data.themeCssVars ?? {})
			.map(([name, value]) => `${name}: ${value}`)
			.join('; ')
	);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="h-screen overflow-y-auto" style={themeVarsStyle}>
	{@render children?.()}
</div>
