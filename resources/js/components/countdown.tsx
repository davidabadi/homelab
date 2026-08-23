/**
 * The per-row "days until" indicator (spec §5): "Today"/"Tomorrow" up close,
 * then a big number of days. Shared by Movies › Upcoming and the unaired rows
 * in Shows › Upcoming.
 */
export function Countdown({ daysUntil }: { daysUntil: number }) {
    if (daysUntil <= 1) {
        return (
            <p className="shrink-0 text-sm font-bold tracking-wide uppercase">
                {daysUntil === 0 ? 'Today' : 'Tomorrow'}
            </p>
        );
    }

    return (
        <div className="shrink-0 text-right">
            <p className="text-2xl leading-none font-bold">{daysUntil}</p>
            <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                days
            </p>
        </div>
    );
}
