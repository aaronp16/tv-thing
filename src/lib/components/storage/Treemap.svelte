<script lang="ts">
	/**
	 * Treemap — WinDirStat-style space map of a StorageNode tree.
	 *
	 * Draws up to three levels below the current view (e.g. group → show →
	 * season). Tiles too small to label are merged into a "+N more" tile, and
	 * clicking a group header or a "+N more" tile zooms in.
	 */
	import type { StorageNode } from '$lib/types';
	import { squarify, type Rect } from '$lib/treemap';
	import { formatBytes } from '$lib/format';
	import { untrack } from 'svelte';

	interface Props {
		root: StorageNode;
		height: number;
		/** Tile colour for a node, given its ancestors (outermost first, excluding root) */
		colorOf: (node: StorageNode, ancestors: StorageNode[]) => string;
		onSelect: (node: StorageNode, ancestors: StorageNode[]) => void;
		/** Extra tooltip line, e.g. hit-and-run status */
		describe?: (node: StorageNode) => string | null;
		selectedId?: string | null;
	}

	let { root, height, colorOf, onSelect, describe, selectedId = null }: Props = $props();

	const GAP = 1.5;
	const GROUP_HEADER = 24;
	const ITEM_HEADER = 18;
	/** Tiles smaller than this (px²) get merged into "+N more" */
	const MIN_AREA = 1400;

	// ─── Zoom ─────────────────────────────────────────────────────────────────

	/** Nodes zoomed into, outermost first. May include synthetic "+N more" nodes. */
	let stack = $state<StorageNode[]>([]);
	const view = $derived(stack.at(-1) ?? root);

	const isMore = (n: StorageNode) => n.id.endsWith('::more');

	function findById(node: StorageNode, id: string): StorageNode | null {
		if (node.id === id) return node;
		for (const c of node.children ?? []) {
			const found = findById(c, id);
			if (found) return found;
		}
		return null;
	}

	// After a rescan, keep the zoom on nodes that still exist (stopping at any
	// "+N more" level, since its contents may have changed)
	$effect(() => {
		const current = root;
		untrack(() => {
			const next: StorageNode[] = [];
			for (const node of stack) {
				const found = isMore(node) ? null : findById(current, node.id);
				if (!found) break;
				next.push(found);
			}
			stack = next;
		});
	});

	function zoomTo(chain: StorageNode[]) {
		stack = [...stack, ...chain];
		hovered = null;
	}

	// ─── Layout ───────────────────────────────────────────────────────────────

	interface Tile extends Rect {
		node: StorageNode;
		/** Real ancestors inside the current view (outermost first) */
		chain: StorageNode[];
		type: 'frame' | 'leaf' | 'more';
		header: number;
		depth: number;
	}

	/** Merge items that would be too small to read into one "+N more" node */
	function aggregate(parent: StorageNode, items: StorageNode[], rect: Rect): StorageNode[] {
		const total = items.reduce((s, i) => s + i.size, 0);
		if (total === 0) return [];
		const scale = (rect.w * rect.h) / total;
		const small = items.filter((i) => i.size * scale < MIN_AREA);
		if (small.length < 2) return items;
		const big = items.filter((i) => i.size * scale >= MIN_AREA);
		const more: StorageNode = {
			id: `${parent.id}::more`,
			name: `${small.length} more`,
			size: small.reduce((s, i) => s + i.size, 0),
			kind: 'group',
			children: small
		};
		return [...big, more];
	}

	function shrink(r: Rect, header: number): Rect {
		return { x: r.x + GAP, y: r.y + header, w: r.w - GAP * 2, h: r.h - header - GAP };
	}

	let width = $state(0);

	const tiles = $derived.by(() => {
		const out: Tile[] = [];
		if (width <= 0) return out;

		const place = (parent: StorageNode, rect: Rect, chain: StorageNode[], depth: number) => {
			const items = aggregate(parent, parent.children ?? [], rect);
			for (const t of squarify(items, rect)) {
				const node = t.item;
				const base = { x: t.x, y: t.y, w: t.w, h: t.h, node, chain, depth };

				if (isMore(node)) {
					out.push({ ...base, type: 'more', header: 0 });
					continue;
				}

				const hasChildren = (node.children?.length ?? 0) > 0;
				const header = node.kind === 'group' ? GROUP_HEADER : ITEM_HEADER;
				const canNest = hasChildren && depth < 2 && t.w >= 80 && t.h >= header + 36;
				if (!canNest) {
					out.push({ ...base, type: 'leaf', header: 0 });
					continue;
				}

				out.push({ ...base, type: 'frame', header });
				place(node, shrink(t, header), [...chain, node], depth + 1);
			}
		};

		place(view, { x: 0, y: 0, w: width, h: height }, [], 0);
		return out;
	});

	/** Real ancestors of a tile from the root (synthetic nodes and root excluded) */
	function ancestorsOf(tile: Tile): StorageNode[] {
		return [...stack, ...tile.chain].filter((n) => !isMore(n));
	}

	function activate(tile: Tile) {
		if (tile.type === 'more') {
			zoomTo([...tile.chain, tile.node]);
		} else if (tile.node.kind === 'group') {
			zoomTo([...tile.chain, tile.node]);
		} else {
			onSelect(tile.node, ancestorsOf(tile));
		}
	}

	// ─── Tooltip ──────────────────────────────────────────────────────────────

	let hovered = $state<Tile | null>(null);
	let mouse = $state({ x: 0, y: 0 });
	let tooltipEl = $state<HTMLDivElement | null>(null);

	function track(e: MouseEvent) {
		const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
		mouse = { x: e.clientX - box.left, y: e.clientY - box.top };
	}

	const tooltipPos = $derived.by(() => {
		const tw = tooltipEl?.offsetWidth ?? 240;
		const th = tooltipEl?.offsetHeight ?? 60;
		let x = mouse.x + 14;
		let y = mouse.y + 14;
		if (x + tw > width) x = Math.max(0, mouse.x - tw - 14);
		if (y + th > height) y = Math.max(0, mouse.y - th - 14);
		return { x, y };
	});

	// ─── Tile text ────────────────────────────────────────────────────────────

	const labelOf = (n: StorageNode) => n.label ?? n.name;

	/** How much text fits in a leaf tile */
	function textMode(t: Tile): 'large' | 'medium' | 'small' | 'vertical' | 'none' {
		if (t.w >= 150 && t.h >= 64) return 'large';
		if (t.w >= 64 && t.h >= 34) return 'medium';
		if (t.w >= 36 && t.h >= 18) return 'small';
		if (t.w >= 16 && t.h >= 70) return 'vertical';
		return 'none';
	}

	function shading(color: string): string {
		return `background-color: ${color}; background-image: linear-gradient(145deg, rgb(255 255 255 / 0.14), rgb(255 255 255 / 0) 45%, rgb(0 0 0 / 0.22));`;
	}
</script>

<div>
	<!-- Breadcrumb -->
	<div class="mb-2 flex min-h-6 flex-wrap items-center gap-1 text-xs">
		{#if stack.length}
			<button
				type="button"
				onclick={() => (stack = [])}
				class="rounded px-1.5 py-0.5 text-gold-400 transition-colors hover:bg-neutral-800"
				>{root.name}</button
			>
		{/if}
		{#each stack as node, i (node.id)}
			<span class="text-neutral-600">›</span>
			<button
				type="button"
				onclick={() => (stack = stack.slice(0, i + 1))}
				class="max-w-48 truncate rounded px-1.5 py-0.5 transition-colors {i === stack.length - 1
					? 'cursor-default text-neutral-300'
					: 'text-gold-400 hover:bg-neutral-800'}">{labelOf(node)}</button
			>
		{/each}
		<span class="ml-auto hidden text-neutral-600 sm:inline">
			{stack.length ? formatBytes(view.size) : 'Click a group name or “more” tile to zoom in'}
		</span>
	</div>

	<!-- Map -->
	<div
		class="relative w-full overflow-hidden rounded-xl bg-neutral-950 ring-1 ring-neutral-800"
		style="height: {height}px"
		bind:clientWidth={width}
		onmousemove={track}
		onmouseleave={() => (hovered = null)}
		role="presentation"
	>
		{#each tiles as tile (tile.node.id)}
			{@const selected = selectedId === tile.node.id}
			{#if tile.type === 'frame'}
				{@const isGroup = tile.node.kind === 'group'}
				<div
					class="absolute overflow-hidden rounded-lg {selected ? 'z-10 ring-2 ring-white' : ''}"
					style="left: {tile.x + GAP}px; top: {tile.y + GAP}px; width: {tile.w -
						GAP * 2}px; height: {tile.h - GAP * 2}px; {isGroup
						? 'background: rgb(255 255 255 / 0.025)'
						: `background: color-mix(in srgb, ${colorOf(tile.node, ancestorsOf(tile))} 30%, #0a0a0a)`}"
				>
					<button
						type="button"
						onclick={() => activate(tile)}
						onmouseenter={() => (hovered = tile)}
						class="group flex w-full items-center gap-1.5 px-2 text-left transition-colors hover:bg-white/5"
						style="height: {tile.header - GAP}px"
						title={isGroup ? `Zoom into ${tile.node.name}` : `Manage ${labelOf(tile.node)}`}
					>
						<span
							class="truncate {isGroup
								? 'text-xs font-semibold text-neutral-200'
								: 'text-[11px] font-medium text-white/85'}">{labelOf(tile.node)}</span
						>
						{#if tile.w > 110}
							<span class="flex-shrink-0 text-[10px] text-white/45"
								>{formatBytes(tile.node.size)}</span
							>
						{/if}
						{#if isGroup && tile.w > 70}
							<svg
								class="ml-auto h-3 w-3 flex-shrink-0 text-white/30 transition-colors group-hover:text-white/70"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M21 21l-4.35-4.35M11 8v6m-3-3h6m4 0a7 7 0 11-14 0 7 7 0 0114 0z"
								/>
							</svg>
						{/if}
					</button>
				</div>
			{:else}
				{@const mode = textMode(tile)}
				{@const more = tile.type === 'more'}
				<button
					type="button"
					class="absolute overflow-hidden rounded-[5px] text-left transition-[filter,box-shadow] hover:z-10 hover:ring-1 hover:ring-white/50 hover:brightness-125 {selected
						? 'z-10 ring-2 ring-white'
						: ''}"
					style="left: {tile.x + GAP}px; top: {tile.y + GAP}px; width: {Math.max(
						tile.w - GAP * 2,
						1
					)}px; height: {Math.max(tile.h - GAP * 2, 1)}px; {more
						? 'background: repeating-linear-gradient(135deg, rgb(255 255 255 / 0.07) 0 6px, rgb(255 255 255 / 0.03) 6px 12px)'
						: shading(colorOf(tile.node, ancestorsOf(tile)))}"
					onclick={() => activate(tile)}
					onmouseenter={() => (hovered = tile)}
					onfocus={() => (hovered = tile)}
					aria-label="{more ? `${tile.node.name} items` : labelOf(tile.node)}, {formatBytes(
						tile.node.size
					)}"
				>
					{#if more}
						{#if mode !== 'none'}
							<span
								class="flex h-full w-full flex-col items-center justify-center text-center leading-tight"
							>
								<span class="text-[11px] font-semibold text-neutral-300">+{tile.node.name}</span>
								{#if mode === 'large' || mode === 'medium'}
									<span class="text-[10px] text-neutral-500">{formatBytes(tile.node.size)}</span>
								{/if}
							</span>
						{/if}
					{:else if mode === 'large'}
						<span
							class="flex h-full flex-col justify-between p-2 [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]"
						>
							<span class="line-clamp-3 text-sm leading-snug font-semibold text-white"
								>{labelOf(tile.node)}</span
							>
							<span class="flex items-center gap-1.5 text-xs text-white/70">
								{formatBytes(tile.node.size)}
								{#if tile.node.detail}
									<span class="rounded bg-black/25 px-1 text-[10px] text-white/70"
										>{tile.node.detail}</span
									>
								{/if}
							</span>
						</span>
					{:else if mode === 'medium'}
						<span class="block p-1.5 [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]">
							<span
								class="block text-[11px] leading-tight font-medium text-white"
								style="display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: {Math.max(
									1,
									Math.floor((tile.h - 26) / 13)
								)}; overflow: hidden">{labelOf(tile.node)}</span
							>
							<span class="mt-0.5 block text-[10px] text-white/65"
								>{formatBytes(tile.node.size)}</span
							>
						</span>
					{:else if mode === 'small'}
						<span
							class="block truncate px-1 text-[10px] leading-[16px] font-medium text-white/90 [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]"
							>{labelOf(tile.node)}</span
						>
					{:else if mode === 'vertical'}
						<span
							class="block truncate py-1 text-[10px] font-medium text-white/90 [text-shadow:0_1px_2px_rgb(0_0_0/0.5)]"
							style="writing-mode: vertical-rl; transform: rotate(180deg); max-height: 100%; line-height: {Math.min(
								tile.w - GAP * 2,
								16
							)}px">{labelOf(tile.node)}</span
						>
					{/if}
				</button>
			{/if}
		{/each}

		<!-- Tooltip -->
		{#if hovered}
			{@const extra = hovered.type === 'leaf' ? (describe?.(hovered.node) ?? null) : null}
			<div
				bind:this={tooltipEl}
				class="pointer-events-none absolute z-30 max-w-72 rounded-lg bg-neutral-900/95 px-3 py-2 shadow-xl ring-1 ring-white/10 backdrop-blur"
				style="left: {tooltipPos.x}px; top: {tooltipPos.y}px"
			>
				<p class="text-xs font-semibold break-words text-white">
					{hovered.type === 'more' ? `${hovered.node.name} items` : labelOf(hovered.node)}
				</p>
				{#if hovered.node.label}
					<p class="mt-0.5 text-[10px] break-all text-neutral-500">{hovered.node.name}</p>
				{/if}
				<p class="mt-1 text-[11px] text-neutral-300">
					{formatBytes(hovered.node.size)}{#if hovered.node.detail}{' · '}{hovered.node.detail}{/if}
				</p>
				{#if extra}
					<p class="mt-0.5 text-[11px] text-neutral-400">{extra}</p>
				{/if}
				<p class="mt-1 text-[10px] text-neutral-600">
					{hovered.type === 'more' || hovered.node.kind === 'group'
						? 'Click to zoom in'
						: 'Click to manage'}
				</p>
			</div>
		{/if}
	</div>
</div>
