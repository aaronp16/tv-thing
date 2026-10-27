/**
 * Move an element to <body>, so overlays escape any ancestor stacking
 * context (e.g. an animated container) and sit above fixed UI like the
 * mobile tab bar.
 */
export function portal(node: HTMLElement) {
	document.body.appendChild(node);
	return {
		destroy() {
			node.remove();
		}
	};
}
