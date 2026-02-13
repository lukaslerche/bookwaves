<script lang="ts">
	import PageHeader from '$lib/components/PageHeader.svelte';
	import NavigationCard from '$lib/components/NavigationCard.svelte';
	import { Tag, Settings, BookOpen, Bell, SquarePen } from '@lucide/svelte';
</script>

<div class="app-page-bg-home min-h-full p-8">
	<div class="mx-auto max-w-6xl">
		<PageHeader title="BOOKWAVES" subtitle="Cloud-Based RFID Solution for Libraries" showLogo />

		<div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
			<NavigationCard
				href="/checkout"
				title="Checkout"
				description="Borrow and return materials"
				icon={BookOpen}
				iconColor="primary"
			/>

			<NavigationCard
				href="/gate"
				title="Security Gate"
				description="Monitor items exiting the library"
				icon={Bell}
				iconColor="error"
			/>

			<NavigationCard
				href="/reader"
				title="Reader"
				description="Show and edit tags on the reader"
				icon={SquarePen}
				iconColor="info"
			/>

			<NavigationCard
				href="/tagging"
				title="Tagging"
				description="Batch write RFID tags from barcodes"
				icon={Tag}
				iconColor="warning"
			/>

			<NavigationCard
				href="/admin"
				title="Admin"
				description="See and edit RFID settings"
				icon={Settings}
				iconColor="secondary"
			/>
		</div>

		<div class="mt-16 text-center text-blue-50/80">
			<p class="text-sm font-medium">Modern UHF Technology for Precise Media Localization</p>
		</div>
	</div>
</div>
