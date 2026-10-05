import {
    cableLengthMm,
    createOrthogonalRoute,
    terminalPoint,
    updateRouteEndpoints,
} from './geometry.ts';
import type {
    CableBundle,
    CableEntry,
    ExternalCable,
    LightingDesign,
    LightingLayout,
    MmPoint,
} from './types';

type EnclosureDimensions = Pick<LightingDesign, 'width_mm' | 'height_mm'>;

export function cableEntrySideLength(
    entry: CableEntry,
    design: EnclosureDimensions,
): number {
    return entry.side === 'top' || entry.side === 'bottom'
        ? design.width_mm
        : design.height_mm;
}

export function clampCableEntryOffset(
    entry: CableEntry,
    design: EnclosureDimensions,
): number {
    return (
        Math.round(
            Math.max(
                0,
                Math.min(
                    entry.offset_mm,
                    cableEntrySideLength(entry, design) - entry.span_mm,
                ),
            ) * 100,
        ) / 100
    );
}

export function cableEntryPoint(
    entry: CableEntry,
    design: EnclosureDimensions,
): MmPoint {
    const position =
        Math.round((entry.offset_mm + entry.span_mm / 2) * 100) / 100;

    switch (entry.side) {
        case 'top':
            return { x_mm: position, y_mm: 0 };
        case 'bottom':
            return { x_mm: position, y_mm: design.height_mm };
        case 'left':
            return { x_mm: 0, y_mm: position };
        case 'right':
            return { x_mm: design.width_mm, y_mm: position };
    }
}

export function moveCableEntry(
    entry: CableEntry,
    design: EnclosureDimensions,
    point: MmPoint,
): CableEntry {
    const position =
        entry.side === 'top' || entry.side === 'bottom'
            ? point.x_mm
            : point.y_mm;
    const moved = { ...entry, offset_mm: position - entry.span_mm / 2 };

    return { ...moved, offset_mm: clampCableEntryOffset(moved, design) };
}

export function bundleBreakoutPoint(bundle: CableBundle): MmPoint | null {
    return bundle.route_points.at(-1) ?? null;
}

export function externalCableOrigin(
    cable: ExternalCable,
    layout: LightingLayout,
): MmPoint | null {
    if (cable.bundle_portable_id) {
        const bundle = layout.cable_bundles.find(
            (item) => item.portable_id === cable.bundle_portable_id,
        );

        return bundle ? bundleBreakoutPoint(bundle) : null;
    }

    const entry = layout.cable_entries.find(
        (item) => item.portable_id === cable.cable_entry_portable_id,
    );

    return entry ? cableEntryPoint(entry, layout.design) : null;
}

export function defaultBundleRoute(
    entry: CableEntry,
    design: EnclosureDimensions,
): MmPoint[] {
    const start = cableEntryPoint(entry, design);
    const distance = Math.min(
        50,
        (entry.side === 'top' || entry.side === 'bottom'
            ? design.height_mm
            : design.width_mm) / 2,
    );
    const end = { ...start };

    if (entry.side === 'top') {
        end.y_mm += distance;
    }

    if (entry.side === 'bottom') {
        end.y_mm -= distance;
    }

    if (entry.side === 'left') {
        end.x_mm += distance;
    }

    if (entry.side === 'right') {
        end.x_mm -= distance;
    }

    return [start, end];
}

function samePoint(first: MmPoint | undefined, second: MmPoint): boolean {
    return first?.x_mm === second.x_mm && first?.y_mm === second.y_mm;
}

function anchoredRoute(
    points: MmPoint[],
    start: MmPoint,
    end: MmPoint,
): MmPoint[] {
    if (samePoint(points[0], start) && samePoint(points.at(-1), end)) {
        return points;
    }

    return points.length
        ? updateRouteEndpoints(points, start, end)
        : createOrthogonalRoute(start, end);
}

/** Resolves enclosure anchors after row growth and preserves manually routed bends. */
export function refreshExternalCabling(layout: LightingLayout): LightingLayout {
    const cable_entries = (layout.cable_entries ?? []).map((entry) => {
        if (
            !Number.isFinite(entry.offset_mm) ||
            !Number.isFinite(entry.span_mm) ||
            entry.span_mm <= 0 ||
            entry.span_mm > cableEntrySideLength(entry, layout.design)
        ) {
            throw new Error('Cable entry span must fit on its enclosure side.');
        }

        return {
            ...entry,
            offset_mm: clampCableEntryOffset(entry, layout.design),
        };
    });
    const cable_bundles = (layout.cable_bundles ?? []).map((bundle) => {
        const entry = cable_entries.find(
            (item) => item.portable_id === bundle.cable_entry_portable_id,
        );

        if (!entry) {
            throw new Error('Choose an existing cable entry for this bundle.');
        }

        const start = cableEntryPoint(entry, layout.design);
        const end = bundleBreakoutPoint(bundle);

        return {
            ...bundle,
            route_points: end
                ? anchoredRoute(bundle.route_points, start, end)
                : defaultBundleRoute(entry, layout.design),
        };
    });
    const next = { ...layout, cable_entries, cable_bundles };
    const external_cables = (layout.external_cables ?? []).map((cable) => {
        if (
            Boolean(cable.bundle_portable_id) ===
            Boolean(cable.cable_entry_portable_id)
        ) {
            throw new Error('Choose either a bundle or a direct cable entry.');
        }

        const start = externalCableOrigin(cable, next);

        if (!start) {
            throw new Error('Choose an existing bundle or cable entry.');
        }

        const component = layout.components.find(
            (item) => item.portable_id === cable.internal_component_portable_id,
        );

        if (cable.internal_component_portable_id && !component) {
            return {
                ...cable,
                internal_component_portable_id: null,
                internal_terminal: null,
                branch_route_points: [],
            };
        }

        if (Boolean(component) !== Boolean(cable.internal_terminal)) {
            throw new Error(
                'Choose both a component and its terminal, or leave this cable unassigned.',
            );
        }

        let end = cable.branch_route_points.at(-1);

        if (component && cable.internal_terminal) {
            const definition = layout.definitions.find(
                (item) => item.id === component.component_definition_id,
            );

            if (!definition) {
                throw new Error(
                    'The assigned component definition is missing.',
                );
            }

            end = terminalPoint(component, definition, cable.internal_terminal);
        }

        return {
            ...cable,
            cable_class: cable.bundle_portable_id
                ? null
                : (cable.cable_class ?? 'other'),
            direction: cable.bundle_portable_id
                ? null
                : (cable.direction ?? 'mixed'),
            branch_route_points: end
                ? anchoredRoute(cable.branch_route_points, start, end)
                : [],
        };
    });

    return { ...next, external_cables };
}

export function externalCableLengthMm(
    cable: ExternalCable,
    layout: LightingLayout,
): number {
    const bundle = layout.cable_bundles.find(
        (item) => item.portable_id === cable.bundle_portable_id,
    );

    return (
        cableLengthMm(bundle?.route_points ?? []) +
        cableLengthMm(cable.branch_route_points)
    );
}
