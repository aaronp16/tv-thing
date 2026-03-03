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
		default: 'bg-white/[0.06] text-neutral-300 ring-1 ring-white/[0.06]',
		primary: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20',
		success: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
		warning: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20',
		accent: 'bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/20',
		glass: 'bg-white/[0.08] text-white/80 backdrop-blur-sm ring-1 ring-white/[0.1]'
	};

	const sizeClasses: Record<string, string> = {
		xs: 'px-1.5 py-0.5 text-[10px]',
		sm: 'px-2 py-0.5 text-xs',
		md: 'px-2.5 py-1 text-sm'
	};
</script>

<span
	class="inline-flex items-center gap-1 rounded-full leading-none font-medium
		{variantClasses[variant]} {sizeClasses[size]} {className}"
>
	{@render children()}
</span>
