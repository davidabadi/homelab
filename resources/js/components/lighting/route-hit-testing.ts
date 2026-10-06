import { canvasScale } from './geometry.ts';
import type { LightingLayout, LightingSelection, MmPoint } from './types';

export type RouteSelection = {
    type: 'connection' | 'external_cable' | 'cable_bundle';
    id: string;
};

export type WiringRoute = {
    selection: RouteSelection;
    paths: MmPoint[][];
    countable: boolean;
};

export type RouteVisibility = {
    internal: boolean;
    external: boolean;
};

export function routeSelectionKey(selection: RouteSelection): string {
    return `${selection.type}:${selection.id}`;
}

export function isRouteSelection(
    selection: LightingSelection,
): selection is RouteSelection {
    return Boolean(
        selection &&
        ['connection', 'external_cable', 'cable_bundle'].includes(
            selection.type,
        ),
    );
}

/** Field routes include the shared trunk even when their termination is unassigned. */
export function buildWiringRoutes(
    layout: LightingLayout,
    visibility: RouteVisibility = { internal: true, external: true },
): WiringRoute[] {
    const routes: WiringRoute[] = visibility.internal
        ? layout.connections.map((connection) => ({
              selection: { type: 'connection', id: connection.portable_id },
              paths: [connection.route_points],
              countable: true,
          }))
        : [];

    if (!visibility.external) {
        return routes;
    }

    const bundles = new Map(
        layout.cable_bundles.map((bundle) => [bundle.portable_id, bundle]),
    );
    const populatedBundles = new Set(
        layout.external_cables.flatMap((cable) =>
            cable.bundle_portable_id ? [cable.bundle_portable_id] : [],
        ),
    );

    for (const bundle of layout.cable_bundles) {
        routes.push({
            selection: { type: 'cable_bundle', id: bundle.portable_id },
            paths: [bundle.route_points],
            countable: !populatedBundles.has(bundle.portable_id),
        });
    }

    for (const cable of layout.external_cables) {
        const trunk = cable.bundle_portable_id
            ? bundles.get(cable.bundle_portable_id)?.route_points
            : undefined;

        routes.push({
            selection: { type: 'external_cable', id: cable.portable_id },
            paths: [...(trunk ? [trunk] : []), cable.branch_route_points],
            countable: true,
        });
    }

    return routes;
}

export function screenToleranceMm(pixels: number, zoom: number): number {
    return pixels / (canvasScale * Math.max(zoom, 0.001));
}

export function pointToSegmentDistanceMm(
    point: MmPoint,
    start: MmPoint,
    end: MmPoint,
): number {
    const x = end.x_mm - start.x_mm;
    const y = end.y_mm - start.y_mm;
    const squaredLength = x * x + y * y;
    const fraction =
        squaredLength === 0
            ? 0
            : Math.max(
                  0,
                  Math.min(
                      1,
                      ((point.x_mm - start.x_mm) * x +
                          (point.y_mm - start.y_mm) * y) /
                          squaredLength,
                  ),
              );

    return Math.hypot(
        point.x_mm - (start.x_mm + fraction * x),
        point.y_mm - (start.y_mm + fraction * y),
    );
}

export function findRoutesNearPoint(
    routes: WiringRoute[],
    point: MmPoint,
    toleranceMm: number,
): RouteSelection[] {
    const hits = new Map<
        string,
        { selection: RouteSelection; distance: number }
    >();

    for (const route of routes) {
        let distance = Infinity;

        for (const path of route.paths) {
            for (let index = 1; index < path.length; index++) {
                distance = Math.min(
                    distance,
                    pointToSegmentDistanceMm(
                        point,
                        path[index - 1],
                        path[index],
                    ),
                );
            }
        }

        if (distance <= toleranceMm) {
            const key = routeSelectionKey(route.selection);
            const existing = hits.get(key);

            if (!existing || distance < existing.distance) {
                hits.set(key, { selection: route.selection, distance });
            }
        }
    }

    return [...hits.values()]
        .sort(
            (left, right) =>
                left.distance - right.distance ||
                Number(left.selection.type === 'cable_bundle') -
                    Number(right.selection.type === 'cable_bundle') ||
                routeSelectionKey(left.selection).localeCompare(
                    routeSelectionKey(right.selection),
                ),
        )
        .map((hit) => hit.selection);
}
