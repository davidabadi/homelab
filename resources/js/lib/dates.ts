/**
 * Date-only helpers for server-provided `YYYY-MM-DD` strings (air dates,
 * release dates). Parsing must go through local-time date parts — a bare
 * `new Date('2026-07-10')` is interpreted as UTC midnight and shifts a day in
 * negative-offset timezones.
 */
export function parseDateString(date: string): Date {
    const [year, month, day] = date.split('-').map(Number);

    return new Date(year, month - 1, day);
}

/** Whole days from one calendar date to another (negative if `to` is earlier). */
export function daysBetween(from: Date, to: Date): number {
    return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function formatLongDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
}

export function formatWeekday(date: Date): string {
    return date.toLocaleDateString('en-US', { weekday: 'long' });
}
