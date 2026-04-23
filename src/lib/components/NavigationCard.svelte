<script lang="ts">
	import type { Component } from 'svelte';

	interface Props {
		href: string;
		title: string;
		description?: string;
		icon: Component;
		iconColor?: string;
		iconColorValue?: string;
		size?: 'default' | 'large';
	}

	let {
		href,
		title,
		description,
		icon: Icon,
		iconColor = 'primary',
		iconColorValue,
		size = 'default'
	}: Props = $props();

	const iconBgClass = $derived(`bg-${iconColor}/10`);
	const iconColorClass = $derived(`text-${iconColor}`);
	const padding = $derived(size === 'large' ? 'p-12' : 'p-8');
	const iconSize = $derived(size === 'large' ? 'h-20 w-20' : 'h-16 w-16');
	const iconInnerSize = $derived(size === 'large' ? 'h-12 w-12' : 'h-8 w-8');
	const titleSize = $derived(size === 'large' ? 'text-3xl' : 'text-2xl');
	const descSize = $derived(size === 'large' ? 'text-lg' : 'text-sm');
	const iconContainerStyle = $derived(
		iconColorValue
			? `background-color: color-mix(in oklab, ${iconColorValue}, transparent 86%);`
			: undefined
	);
	const iconStyle = $derived(iconColorValue ? `color: ${iconColorValue};` : undefined);
</script>

<a
	{href}
	class="group hover:shadow-3xl card bg-base-100 shadow-2xl transition-all hover:-translate-y-2"
>
	<div class="card-body items-center text-center {padding}">
		<div
			class="mb-4 flex {iconSize} items-center justify-center rounded-lg {iconBgClass}"
			style={iconContainerStyle}
		>
			<Icon class="{iconInnerSize} {iconColorClass}" style={iconStyle} />
		</div>
		<h2 class="mb-2 {titleSize} font-bold">{title}</h2>
		{#if description}
			<p class="{descSize} text-base-content/70">{description}</p>
		{/if}
	</div>
</a>
