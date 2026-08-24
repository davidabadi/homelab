import type {
    PresenceTrip,
    PresenceTripInput,
} from '@/components/presence/types';

export function formatDateOnly(value: string): string {
    const [year, month, day] = value.split('-').map(Number);

    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function datesOverlap(
    left: Pick<PresenceTripInput, 'entry_date' | 'exit_date'>,
    right: Pick<PresenceTripInput, 'entry_date' | 'exit_date'>,
): boolean {
    return (
        left.entry_date <= right.exit_date && left.exit_date >= right.entry_date
    );
}

export function overlappingTrips(
    input: PresenceTripInput,
    trips: PresenceTrip[],
    editingId: number | null,
): PresenceTrip[] {
    if (!input.entry_date || !input.exit_date) {
        return [];
    }

    return trips.filter(
        (trip) => trip.id !== editingId && datesOverlap(input, trip),
    );
}

export function dateInputForYear(year: number, today: string): string {
    return today.startsWith(`${year}-`) ? today : `${year}-01-01`;
}
