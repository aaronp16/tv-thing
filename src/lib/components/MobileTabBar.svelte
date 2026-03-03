<script lang="ts">
	export type MobileTab = 'search' | 'discover' | 'downloads';

	interface Props {
		activeTab: MobileTab;
		activeDownloadCount: number;
		onTabChange: (tab: MobileTab) => void;
	}

	let { activeTab, activeDownloadCount, onTabChange }: Props = $props();
</script>

<div
	class="fixed right-0 bottom-0 left-0 z-40 border-t border-neutral-800 bg-neutral-900/95 backdrop-blur-md"
	style="padding-bottom: env(safe-area-inset-bottom, 0px);"
>
	<div class="flex items-stretch">
		<!-- Search Tab -->
		<button
			onclick={() => onTabChange('search')}
			class="flex flex-1 flex-col items-center justify-center gap-1 border-t-2 py-2 transition-all {activeTab ===
			'search'
				? 'border-white bg-white/[0.04] text-white'
				: 'border-transparent text-neutral-500'}"
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

		<!-- Discover Tab -->
		<button
			onclick={() => onTabChange('discover')}
			class="flex flex-1 flex-col items-center justify-center gap-1 border-t-2 py-2 transition-all {activeTab ===
			'discover'
				? 'border-violet-400 bg-white/[0.04] text-violet-400'
				: 'border-transparent text-neutral-500'}"
			aria-label="Discover"
			aria-current={activeTab === 'discover' ? 'page' : undefined}
		>
			<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"
				/>
			</svg>
			<span class="text-xs font-medium">Discover</span>
		</button>

		<!-- Downloads Tab -->
		<button
			onclick={() => onTabChange('downloads')}
			class="relative flex flex-1 flex-col items-center justify-center gap-1 border-t-2 py-2 transition-all {activeTab ===
			'downloads'
				? 'border-white bg-white/[0.04] text-white'
				: 'border-transparent text-neutral-500'}"
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
					class="absolute top-1 right-[20%] flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-bold text-white"
				>
					{activeDownloadCount}
				</span>
			{/if}
		</button>
	</div>
</div>
