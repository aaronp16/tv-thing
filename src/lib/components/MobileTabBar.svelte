<script lang="ts">
	export type MobileTab = 'search' | 'downloads';

	interface Props {
		activeTab: MobileTab;
		activeDownloadCount: number;
		onTabChange: (tab: MobileTab) => void;
	}

	let { activeTab, activeDownloadCount, onTabChange }: Props = $props();
</script>

<div
	class="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-800 bg-neutral-900"
	style="padding-bottom: env(safe-area-inset-bottom, 0px);"
>
	<div class="flex items-stretch">
		<!-- Search Tab -->
		<button
			onclick={() => onTabChange('search')}
			class="flex flex-1 flex-col items-center justify-center gap-1 border-t-2 py-2 transition-all {activeTab === 'search'
				? 'border-white bg-neutral-800 text-white'
				: 'border-transparent bg-neutral-900 text-neutral-500'}"
			aria-label="Search"
			aria-current={activeTab === 'search' ? 'page' : undefined}
		>
			<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
			<span class="text-xs font-medium">Search</span>
		</button>

		<!-- Downloads Tab -->
		<button
			onclick={() => onTabChange('downloads')}
			class="relative flex flex-1 flex-col items-center justify-center gap-1 border-t-2 py-2 transition-all {activeTab === 'downloads'
				? 'border-white bg-neutral-800 text-white'
				: 'border-transparent bg-neutral-900 text-neutral-500'}"
			aria-label="Downloads"
			aria-current={activeTab === 'downloads' ? 'page' : undefined}
		>
			<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
				/>
			</svg>
			<span class="text-xs font-medium">Downloads</span>

			{#if activeDownloadCount > 0}
				<span
					class="absolute right-[20%] top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white"
				>
					{activeDownloadCount}
				</span>
			{/if}
		</button>
	</div>
</div>
