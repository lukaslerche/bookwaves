<script lang="ts">
	import { m } from '#lib/paraglide/messages.js';
	import { HandCoins, BookOpen } from '@lucide/svelte';

	interface Props {
		name: string;
		fees: number;
		borrowedCount: number;
	}

	let { name, fees, borrowedCount }: Props = $props();
</script>

<div class="card border border-base-300 bg-base-100 shadow-lg">
	<div class="card-body">
		<h2 class="card-title text-2xl font-bold">{m.welcome()}, {name}</h2>
		<div class="divider my-1"></div>
		<div class="flex flex-col gap-3 sm:flex-row sm:gap-8">
			<div class="flex items-center gap-2">
				<div class="badge gap-2 badge-lg badge-warning">
					<HandCoins class="h-4 w-4" />
					<span class="font-semibold">€ {fees.toFixed(2)} {m.fees()}</span>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<div class="badge gap-2 badge-lg badge-info">
					<BookOpen class="h-4 w-4" />
					<span class="font-semibold">{borrowedCount} {m.items_borrowed()}</span>
				</div>
			</div>
		</div>
	</div>
</div>
