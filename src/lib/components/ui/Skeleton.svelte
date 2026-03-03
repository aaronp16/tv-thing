<script lang="ts">
	/**
	 * Skeleton shimmer loader - used as placeholder while content loads.
	 * Supports different shapes via the `rounded` prop.
	 */
	interface Props {
		class?: string;
		rounded?: 'sm' | 'md' | 'lg' | 'full' | 'none';
	}

	let { class: className = '', rounded = 'md' }: Props = $props();

	const roundedClass: Record<string, string> = {
		sm: 'rounded-sm',
		md: 'rounded-md',
		lg: 'rounded-lg',
		full: 'rounded-full',
		none: 'rounded-none'
	};
</script>

<div class="shimmer {roundedClass[rounded]} {className}" aria-hidden="true"></div>
