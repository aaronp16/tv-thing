<script lang="ts">
	/**
	 * Star rating display component.
	 * Shows a score as a filled/empty star icon with the numeric value.
	 */
	interface Props {
		score: number;
		max?: number;
		size?: 'sm' | 'md' | 'lg';
		showLabel?: boolean;
		class?: string;
	}

	let { score, max = 10, size = 'sm', showLabel = true, class: className = '' }: Props = $props();

	const sizeClasses: Record<string, { icon: string; text: string }> = {
		sm: { icon: 'w-3.5 h-3.5', text: 'text-xs' },
		md: { icon: 'w-4 h-4', text: 'text-sm' },
		lg: { icon: 'w-5 h-5', text: 'text-base' }
	};

	const scoreColor = $derived.by(() => {
		const pct = score / max;
		if (pct >= 0.7) return 'text-emerald-400';
		if (pct >= 0.5) return 'text-amber-400';
		return 'text-red-400';
	});

	const fillPct = $derived(Math.round((score / max) * 100));
</script>

<span class="inline-flex items-center gap-1 {className}">
	<span class="relative {sizeClasses[size].icon}">
		<!-- Empty star (background) -->
		<svg class="absolute inset-0 text-neutral-600" viewBox="0 0 20 20" fill="currentColor">
			<path
				d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
			/>
		</svg>
		<!-- Filled star (clipped) -->
		<svg
			class="absolute inset-0 {scoreColor}"
			viewBox="0 0 20 20"
			fill="currentColor"
			style="clip-path: inset(0 {100 - fillPct}% 0 0)"
		>
			<path
				d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
			/>
		</svg>
	</span>
	{#if showLabel}
		<span class="{sizeClasses[size].text} {scoreColor} font-semibold tabular-nums">
			{score.toFixed(1)}
		</span>
	{/if}
</span>
