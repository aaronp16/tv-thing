<script lang="ts">
	import './layout.css';
	import Toast from '$lib/components/Toast.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<title>tv-thing</title>
</svelte:head>

<div class="flex h-screen flex-col bg-neutral-900 text-white">
	<!-- Main Content -->
	<main class="flex min-h-0 flex-1">
		{@render children()}
	</main>
</div>

<!-- Toast notifications -->
<Toast />
