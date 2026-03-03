<script lang="ts">
	/**
	 * Poster image component with graceful loading and fallback.
	 * Fades in when the image loads, shows a gradient placeholder otherwise.
	 */
	import { tmdbImage } from '$lib/types';

	interface Props {
		path: string | null;
		alt: string;
		size?: string;
		class?: string;
		aspect?: 'poster' | 'backdrop' | 'square';
	}

	let { path, alt, size = 'w500', class: className = '', aspect = 'poster' }: Props = $props();

	let loaded = $state(false);
	let errored = $state(false);

	const src = $derived(tmdbImage(path, size));

	const aspectClasses: Record<string, string> = {
		poster: 'aspect-[2/3]',
		backdrop: 'aspect-video',
		square: 'aspect-square'
	};
</script>

<div class="relative overflow-hidden bg-neutral-800 {aspectClasses[aspect]} {className}">
	<!-- Gradient placeholder -->
	{#if !loaded || errored}
		<div
			class="absolute inset-0 bg-gradient-to-br from-neutral-700/50 via-neutral-800 to-neutral-900"
		>
			<div class="absolute inset-0 flex items-center justify-center">
				<svg
					class="h-10 w-10 text-neutral-600"
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="1.5"
						d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z"
					/>
				</svg>
			</div>
		</div>
	{/if}

	<!-- Actual image -->
	{#if src && !errored}
		<img
			{src}
			{alt}
			loading="lazy"
			class="absolute inset-0 h-full w-full object-cover transition-opacity duration-500
				{loaded ? 'opacity-100' : 'opacity-0'}"
			onload={() => (loaded = true)}
			onerror={() => (errored = true)}
		/>
	{/if}
</div>
