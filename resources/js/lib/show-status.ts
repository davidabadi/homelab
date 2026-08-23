/**
 * The UserShowTracking statuses (spec §4), in the order screens present them.
 * Values mirror App\Enums\ShowStatus.
 */
export const showStatuses = [
    { value: 'watching', label: 'Watching' },
    { value: 'watch_later', label: 'Watch Later' },
    { value: 'finished', label: 'Finished' },
    { value: 'stopped', label: 'Stopped' },
] as const;

export type ShowStatusValue = (typeof showStatuses)[number]['value'];

export function showStatusLabel(status: string): string {
    return (
        showStatuses.find((option) => option.value === status)?.label ??
        'Tracked'
    );
}
