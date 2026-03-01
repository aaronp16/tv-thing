/**
 * Toast notifications store
 */

import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
	id: string;
	type: ToastType;
	message: string;
	duration: number;
}

function createToastsStore() {
	const { subscribe, update } = writable<Toast[]>([]);

	let counter = 0;

	function add(type: ToastType, message: string, duration = 4000): string {
		const id = `toast-${++counter}`;
		const toast: Toast = { id, type, message, duration };

		update((toasts) => [...toasts, toast]);

		// Auto-remove after duration
		if (duration > 0) {
			setTimeout(() => {
				remove(id);
			}, duration);
		}

		return id;
	}

	function remove(id: string) {
		update((toasts) => toasts.filter((t) => t.id !== id));
	}

	return {
		subscribe,
		add,
		remove,
		success: (message: string, duration?: number) => add('success', message, duration),
		error: (message: string, duration?: number) => add('error', message, duration ?? 6000),
		info: (message: string, duration?: number) => add('info', message, duration),
		warning: (message: string, duration?: number) => add('warning', message, duration ?? 5000)
	};
}

export const toasts = createToastsStore();
