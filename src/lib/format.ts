/** Format bytes for display, e.g. 1.5 GB */
export function formatBytes(bytes: number): string {
	if (bytes <= 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
	const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/** Format a duration in seconds as "3.2 days" / "14 hours" */
export function formatDuration(seconds: number): string {
	const hours = seconds / 3600;
	if (hours < 48) return `${Math.floor(hours)} hours`;
	return `${parseFloat((hours / 24).toFixed(1))} days`;
}

/** "8 Dec", or "8 Dec 2027" when not this year */
export function formatReleaseDate(iso: string): string {
	const date = new Date(iso);
	const sameYear = date.getFullYear() === new Date().getFullYear();
	return date.toLocaleDateString('en-GB', {
		day: 'numeric',
		month: 'short',
		...(sameYear ? {} : { year: 'numeric' })
	});
}

/** Whether a title can't be downloaded yet */
export function isUnreleased(availability?: { status: string }): boolean {
	return availability?.status === 'cinema' || availability?.status === 'upcoming';
}
