type DurationUnit = {
    label: string;
    minutes: number;
};

const durationUnits: DurationUnit[] = [
    { label: 'year', minutes: 365 * 24 * 60 },
    { label: 'month', minutes: 30 * 24 * 60 },
    { label: 'day', minutes: 24 * 60 },
    { label: 'hour', minutes: 60 },
    { label: 'minute', minutes: 1 },
];

/**
 * Profile durations use fixed display units: 365-day years, 30-day months,
 * 24-hour days. At most three useful non-zero units are shown.
 */
export function formatProfileDuration(totalMinutes: number): string {
    let remaining = Math.max(0, Math.floor(totalMinutes));
    const parts: string[] = [];

    for (const unit of durationUnits) {
        const value = Math.floor(remaining / unit.minutes);

        if (value > 0) {
            parts.push(
                `${value.toLocaleString()} ${unit.label}${value === 1 ? '' : 's'}`,
            );
            remaining %= unit.minutes;
        }

        if (parts.length === 3) {
            break;
        }
    }

    return parts.length > 0 ? parts.join(' ') : '0 hours';
}

export function ProfileStatCard({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <article className="flex h-32 w-48 shrink-0 flex-col rounded-2xl border border-border/70 bg-card p-4 sm:w-52">
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {label}
            </p>
            <p className="mt-auto text-xl leading-tight font-semibold tracking-tight text-balance tabular-nums">
                {value}
            </p>
        </article>
    );
}
