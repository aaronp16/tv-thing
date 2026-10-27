<script lang="ts">
	/**
	 * Versatile badge/pill component.
	 * Supports different visual variants and sizes.
	 */
	import type { Snippet } from 'svelte';

	interface Props {
		variant?: 'default' | 'primary' | 'success' | 'warning' | 'accent' | 'glass';
		size?: 'xs' | 'sm' | 'md';
		class?: string;
		children: Snippet;
	}

	let { variant = 'default', size = 'sm', class: className = '', children }: Props = $props();

	const variantClasses: Record<string, string> = {
		default: 'bg-neutral-800 text-neutral-300',
		primary: 'bg-neutral-950/75 text-gold-300 backdrop-blur-sm',
		success: 'bg-sage-500/15 text-sage-300',
		warning: 'bg-ember-500/15 text-ember-300',
		accent: 'bg-neutral-950/75 text-tide-300 backdrop-blur-sm',
		glass: 'bg-neutral-950/60 text-white/85 backdrop-blur-sm'
	};

	const sizeClasses: Record<string, string> = {
		xs: 'px-1 py-[3px] text-[9.5px]',
		sm: 'px-1.5 py-1 text-[10.5px]',
		md: 'px-2 py-1.5 text-xs'
	};
</script>

<span
	class="inline-flex items-center gap-1 rounded-[3px] font-mono leading-none font-medium tracking-wider uppercase
		{variantClasses[variant]} {sizeClasses[size]} {className}"
>
	{@render children()}
</span>
