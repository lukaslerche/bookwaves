<script lang="ts">
	import PageHeader from '#lib/components/PageHeader.svelte';
	import NavigationCard from '#lib/components/NavigationCard.svelte';
	import { Tag, Settings, BookOpen, Bell, SquarePen } from '@lucide/svelte';
	import { m } from '#lib/paraglide/messages.js';
</script>

<div class="app-page-bg-home min-h-full p-8">
	<div class="mx-auto max-w-6xl">
		<PageHeader title="BOOKWAVES" subtitle={m.landing_subtitle()} showLogo />

		<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
			<NavigationCard
				href="/checkout"
				title={m.checkout_label()}
				description={m.checkout_description()}
				icon={BookOpen}
				iconColor="primary"
			/>

			<NavigationCard
				href="/gate"
				title={m.gate_label()}
				description={m.gate_description()}
				icon={Bell}
				iconColor="error"
			/>

			<NavigationCard
				href="/reader"
				title={m.reader_label()}
				description={m.reader_description()}
				icon={SquarePen}
				iconColor="info"
			/>

			<NavigationCard
				href="/tagging"
				title={m.tagging_label()}
				description={m.tagging_description()}
				icon={Tag}
				iconColor="warning"
			/>

			<NavigationCard
				href="/admin"
				title={m.admin_label()}
				description={m.admin_description()}
				icon={Settings}
				iconColor="secondary"
			/>
		</div>

		<div class="mt-16 text-center text-blue-50/80">
			<a
				href="https://github.com/lukaslerche/bookwaves"
				class="text-sm font-medium hover:text-blue-50">BookWaves @ GitHub</a
			>
		</div>
	</div>
</div>
