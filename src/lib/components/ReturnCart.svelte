<script lang="ts">
	import type { LmsReturnDirective } from '#lib/lms/lms.js';

	let { directive, compact = false }: { directive: LmsReturnDirective; compact?: boolean } =
		$props();

	let failedImage = $state<string>();

	function badgeClass(color?: string): string {
		switch (color) {
			case 'red':
				return 'badge-error';
			case 'green':
				return 'badge-success';
			case 'blue':
				return 'badge-info';
			case 'yellow':
				return 'badge-warning';
			default:
				return 'badge-neutral';
		}
	}
</script>

<div class="flex flex-wrap items-center gap-2">
	<span
		class="badge {compact ? 'badge-sm' : 'rounded-md px-4 badge-lg'} {badgeClass(directive.color)}"
	>
		{directive.label}
	</span>
	{#if directive.image && directive.image !== failedImage}
		{@const image = directive.image}
		{#key image}
			<img
				src={image}
				alt=""
				width="48"
				height="64"
				class="h-16 w-12 rounded object-contain"
				onerror={() => (failedImage = image)}
			/>
		{/key}
	{/if}
</div>
