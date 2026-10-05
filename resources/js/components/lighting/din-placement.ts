export type DinInterval = { start_mm: number; end_mm: number };
export type DinOccupiedSpace = { x_mm: number; width_mm: number };
export type DinRailBounds = { x_mm: number; length_mm: number };

export const dinSnapIntervalMm = 1;

function hundredths(value: number): number {
    return Math.round(value * 100);
}

export function snapDinPosition(xMm: number, railStartMm: number): number {
    return (
        hundredths(
            railStartMm +
                Math.round((xMm - railStartMm) / dinSnapIntervalMm) *
                    dinSnapIntervalMm,
        ) / 100
    );
}

export function nudgeDinPosition(xMm: number, direction: -1 | 1): number {
    return hundredths(xMm + direction * dinSnapIntervalMm) / 100;
}

export function dinPositionFits(
    rail: DinRailBounds,
    widthMm: number,
    xMm: number,
    occupied: DinOccupiedSpace[],
): boolean {
    if (![rail.x_mm, rail.length_mm, widthMm, xMm].every(Number.isFinite)) {
        return false;
    }

    const start = hundredths(xMm);
    const end = start + hundredths(widthMm);

    return (
        widthMm > 0 &&
        start >= hundredths(rail.x_mm) &&
        end <= hundredths(rail.x_mm) + hundredths(rail.length_mm) &&
        occupied.every((item) => {
            const occupiedStart = hundredths(item.x_mm);
            const occupiedEnd = occupiedStart + hundredths(item.width_mm);

            return end <= occupiedStart || start >= occupiedEnd;
        })
    );
}

export function freeDinGaps(
    rail: DinRailBounds,
    occupied: DinOccupiedSpace[],
): DinInterval[] {
    const end = hundredths(rail.x_mm) + hundredths(rail.length_mm);
    let cursor = hundredths(rail.x_mm);
    const gaps: DinInterval[] = [];
    const intervals = occupied
        .map((item) => ({
            start: hundredths(item.x_mm),
            end: hundredths(item.x_mm) + hundredths(item.width_mm),
        }))
        .sort((left, right) => left.start - right.start);

    for (const interval of intervals) {
        if (interval.start > cursor) {
            gaps.push({
                start_mm: cursor / 100,
                end_mm: Math.min(end, interval.start) / 100,
            });
        }

        cursor = Math.min(end, Math.max(cursor, interval.end));
    }

    if (cursor < end) {
        gaps.push({ start_mm: cursor / 100, end_mm: end / 100 });
    }

    return gaps.filter((gap) => gap.end_mm > gap.start_mm);
}

export function firstDinPosition(
    rail: DinRailBounds,
    widthMm: number,
    occupied: DinOccupiedSpace[],
): number | null {
    const width = hundredths(widthMm);
    const gap = freeDinGaps(rail, occupied).find(
        (candidate) =>
            hundredths(candidate.end_mm) - hundredths(candidate.start_mm) >=
            width,
    );

    return width > 0 ? (gap?.start_mm ?? null) : null;
}

export function nearestDinPosition(
    rail: DinRailBounds,
    widthMm: number,
    preferredXmm: number,
    occupied: DinOccupiedSpace[],
): number | null {
    if (!Number.isFinite(preferredXmm) || widthMm <= 0) {
        return null;
    }

    const width = hundredths(widthMm);
    const preferred = hundredths(preferredXmm);
    const candidates = freeDinGaps(rail, occupied)
        .filter(
            (gap) => hundredths(gap.end_mm) - hundredths(gap.start_mm) >= width,
        )
        .map((gap) =>
            Math.max(
                hundredths(gap.start_mm),
                Math.min(preferred, hundredths(gap.end_mm) - width),
            ),
        )
        .sort(
            (left, right) =>
                Math.abs(left - preferred) - Math.abs(right - preferred) ||
                left - right,
        );

    return candidates.length > 0 ? candidates[0] / 100 : null;
}

export function rowMmToPixels(
    xMm: number,
    rowStartMm: number,
    pixelsPerMm: number,
): number {
    return (xMm - rowStartMm) * pixelsPerMm;
}

export function rowPixelsToMm(
    pixels: number,
    rowStartMm: number,
    pixelsPerMm: number,
): number {
    return rowStartMm + pixels / pixelsPerMm;
}
