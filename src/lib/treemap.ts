/**
 * Squarified treemap layout (Bruls, Huizing & van Wijk).
 *
 * Lays items out in rows along the shorter side of the remaining rectangle,
 * adding items to a row while that keeps the tiles closer to square.
 */

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Worst (largest) aspect ratio in a row of areas laid along a side of length `side` */
function worst(areas: number[], side: number): number {
	const sum = areas.reduce((s, a) => s + a, 0);
	const max = Math.max(...areas);
	const min = Math.min(...areas);
	const side2 = side * side;
	const sum2 = sum * sum;
	return Math.max((side2 * max) / sum2, sum2 / (side2 * min));
}

/**
 * Lay out items (largest first works best) inside `rect`. Items with size 0
 * are skipped. Returns one rect per laid-out item.
 */
export function squarify<T extends { size: number }>(
	items: T[],
	rect: Rect
): (Rect & { item: T })[] {
	const sized = items.filter((i) => i.size > 0);
	const total = sized.reduce((s, i) => s + i.size, 0);
	if (total === 0 || rect.w <= 0 || rect.h <= 0) return [];

	const scale = (rect.w * rect.h) / total;
	const out: (Rect & { item: T })[] = [];
	const free = { ...rect };

	let row: T[] = [];
	const areasOf = (r: T[]) => r.map((i) => i.size * scale);

	const layoutRow = (r: T[]) => {
		const areas = areasOf(r);
		const sum = areas.reduce((s, a) => s + a, 0);
		if (free.w >= free.h) {
			// Column on the left
			const width = sum / free.h;
			let y = free.y;
			r.forEach((item, i) => {
				const h = areas[i] / width;
				out.push({ x: free.x, y, w: width, h, item });
				y += h;
			});
			free.x += width;
			free.w -= width;
		} else {
			// Row along the top
			const height = sum / free.w;
			let x = free.x;
			r.forEach((item, i) => {
				const w = areas[i] / height;
				out.push({ x, y: free.y, w, h: height, item });
				x += w;
			});
			free.y += height;
			free.h -= height;
		}
	};

	let i = 0;
	while (i < sized.length) {
		const side = Math.min(free.w, free.h);
		const candidate = [...row, sized[i]];
		if (row.length === 0 || worst(areasOf(candidate), side) <= worst(areasOf(row), side)) {
			row = candidate;
			i++;
		} else {
			layoutRow(row);
			row = [];
		}
	}
	if (row.length > 0) layoutRow(row);

	return out;
}
