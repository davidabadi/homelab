import { routeSelectionKey } from './route-hit-testing.ts';
import type { RouteSelection, WiringRoute } from './route-hit-testing.ts';
import type { MmPoint } from './types';

export type RouteOverlap = {
    start: MmPoint;
    end: MmPoint;
    selections: RouteSelection[];
};

type Segment = {
    from: number;
    to: number;
    selection: RouteSelection;
};

/** Splits shared orthogonal spans by occupancy; crossings and touching ends are excluded. */
export function findRouteOverlaps(routes: WiringRoute[]): RouteOverlap[] {
    const lines = new Map<
        string,
        { horizontal: boolean; coordinate: number; segments: Segment[] }
    >();

    for (const route of routes.filter((item) => item.countable)) {
        for (const path of route.paths) {
            for (let index = 1; index < path.length; index++) {
                const start = path[index - 1];
                const end = path[index];
                const horizontal = start.y_mm === end.y_mm;

                if (
                    (!horizontal && start.x_mm !== end.x_mm) ||
                    (start.x_mm === end.x_mm && start.y_mm === end.y_mm)
                ) {
                    continue;
                }

                const coordinate = horizontal ? start.y_mm : start.x_mm;
                const key = `${horizontal ? 'h' : 'v'}:${coordinate}`;
                const line = lines.get(key) ?? {
                    horizontal,
                    coordinate,
                    segments: [],
                };
                const first = horizontal ? start.x_mm : start.y_mm;
                const last = horizontal ? end.x_mm : end.y_mm;
                line.segments.push({
                    from: Math.min(first, last),
                    to: Math.max(first, last),
                    selection: route.selection,
                });
                lines.set(key, line);
            }
        }
    }

    const overlaps: RouteOverlap[] = [];

    for (const line of lines.values()) {
        const stops = [
            ...new Set(line.segments.flatMap(({ from, to }) => [from, to])),
        ].sort((left, right) => left - right);
        let previous: RouteOverlap | undefined;

        for (let index = 1; index < stops.length; index++) {
            const from = stops[index - 1];
            const to = stops[index];
            const midpoint = (from + to) / 2;
            const occupants = new Map<string, RouteSelection>();

            for (const segment of line.segments) {
                if (segment.from < midpoint && segment.to > midpoint) {
                    occupants.set(
                        routeSelectionKey(segment.selection),
                        segment.selection,
                    );
                }
            }

            if (occupants.size < 2) {
                previous = undefined;

                continue;
            }

            const selections = [...occupants.values()].sort((left, right) =>
                routeSelectionKey(left).localeCompare(routeSelectionKey(right)),
            );
            const point = (position: number): MmPoint =>
                line.horizontal
                    ? { x_mm: position, y_mm: line.coordinate }
                    : { x_mm: line.coordinate, y_mm: position };
            const start = point(from);
            const end = point(to);

            if (
                previous &&
                previous.end.x_mm === start.x_mm &&
                previous.end.y_mm === start.y_mm &&
                previous.selections.map(routeSelectionKey).join('|') ===
                    selections.map(routeSelectionKey).join('|')
            ) {
                previous.end = end;
            } else {
                previous = { start, end, selections };
                overlaps.push(previous);
            }
        }
    }

    return overlaps;
}
