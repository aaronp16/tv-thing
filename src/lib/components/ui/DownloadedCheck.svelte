<script lang="ts">
	/**
	 * Animated checkmark icon that draws itself in.
	 * Used to indicate a title has been downloaded.
	 */
	interface Props {
		size?: 'sm' | 'md' | 'lg';
		class?: string;
	}

	let { size = 'md', class: className = '' }: Props = $props();

	const sizeClasses: Record<string, string> = {
		sm: 'w-5 h-5',
		md: 'w-6 h-6',
		lg: 'w-8 h-8'
	};
</script>

<span
	class="animate-badge-pop inline-flex items-center justify-center rounded-full
	bg-emerald-500/20 p-1 ring-1 ring-emerald-500/30 {className}"
>
	<svg
		class="{sizeClasses[size]} text-emerald-400"
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="2.5"
		stroke-linecap="round"
		stroke-linejoin="round"
	>
		<path class="check-animate" d="M5 13l4 4L19 7" />
	</svg>
</span>
