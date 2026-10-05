import type {
    ComponentDefinition,
    LightingLayout,
    LightingSelection,
    MmPoint,
    PlacedComponent,
    TerminalDefinition,
} from './types';

export type { MmPoint } from './types';
export type CanvasPoint = { x: number; y: number };
export type MmBounds = MmPoint & { width: number; height: number };

export const canvasScale = 4;

export function mmToCanvas(value: number, scale = canvasScale): number {
    return value * scale;
}

export function canvasToMm(value: number, scale = canvasScale): number {
    return value / scale;
}

export function mmPointToCanvas(
    point: MmPoint,
    scale = canvasScale,
): CanvasPoint {
    return {
        x: mmToCanvas(point.x_mm, scale),
        y: mmToCanvas(point.y_mm, scale),
    };
}

export function canvasPointToMm(
    point: CanvasPoint,
    scale = canvasScale,
): MmPoint {
    return {
        x_mm: canvasToMm(point.x, scale),
        y_mm: canvasToMm(point.y, scale),
    };
}

export function snapToGrid(value: number, gridSize: number): number {
    return gridSize > 0 ? Math.round(value / gridSize) * gridSize : value;
}

export function snapPoint(point: MmPoint, gridSize: number): MmPoint {
    return {
        x_mm: snapToGrid(point.x_mm, gridSize),
        y_mm: snapToGrid(point.y_mm, gridSize),
    };
}

export function rotatedBounds(
    width: number,
    height: number,
    rotation: number,
): { width: number; height: number } {
    const angle = ((rotation % 360) + 360) % 360;

    return angle === 90 || angle === 270
        ? { width: height, height: width }
        : { width, height };
}

export function rotatePoint(
    point: MmPoint,
    width: number,
    height: number,
    rotation: number,
): MmPoint {
    const angle = ((rotation % 360) + 360) % 360;

    switch (angle) {
        case 90:
            return { x_mm: height - point.y_mm, y_mm: point.x_mm };
        case 180:
            return { x_mm: width - point.x_mm, y_mm: height - point.y_mm };
        case 270:
            return { x_mm: point.y_mm, y_mm: width - point.x_mm };
        default:
            return { ...point };
    }
}

export function normalizeOrthogonalRoute(points: MmPoint[]): MmPoint[] {
    const result: MmPoint[] = [];

    for (const point of points) {
        const previous = result.at(-1);

        if (
            previous &&
            previous.x_mm === point.x_mm &&
            previous.y_mm === point.y_mm
        ) {
            continue;
        }

        if (
            previous &&
            previous.x_mm !== point.x_mm &&
            previous.y_mm !== point.y_mm
        ) {
            result.push({ x_mm: point.x_mm, y_mm: previous.y_mm });
        }

        result.push({ ...point });

        while (result.length >= 3) {
            const [a, b, c] = result.slice(-3);

            const horizontal =
                a.y_mm === b.y_mm &&
                b.y_mm === c.y_mm &&
                b.x_mm >= Math.min(a.x_mm, c.x_mm) &&
                b.x_mm <= Math.max(a.x_mm, c.x_mm);
            const vertical =
                a.x_mm === b.x_mm &&
                b.x_mm === c.x_mm &&
                b.y_mm >= Math.min(a.y_mm, c.y_mm) &&
                b.y_mm <= Math.max(a.y_mm, c.y_mm);

            if (horizontal || vertical) {
                result.splice(result.length - 2, 1);
            } else {
                break;
            }
        }
    }

    return result.length === 1 && points.length > 1
        ? [result[0], { ...result[0] }]
        : result;
}

export function createOrthogonalRoute(
    source: MmPoint,
    target: MmPoint,
): MmPoint[] {
    const middleX = (source.x_mm + target.x_mm) / 2;

    return normalizeOrthogonalRoute([
        source,
        { x_mm: middleX, y_mm: source.y_mm },
        { x_mm: middleX, y_mm: target.y_mm },
        target,
    ]);
}

export function updateRouteEndpoints(
    points: MmPoint[],
    source: MmPoint,
    target: MmPoint,
): MmPoint[] {
    if (points.length < 3) {
        return createOrthogonalRoute(source, target);
    }

    const next = points.map((point) => ({ ...point }));
    const first = next[0];
    const second = next[1];
    const last = next.at(-1)!;
    const penultimate = next.at(-2)!;

    if (first.y_mm === second.y_mm) {
        second.y_mm = source.y_mm;
    } else {
        second.x_mm = source.x_mm;
    }

    if (last.y_mm === penultimate.y_mm) {
        penultimate.y_mm = target.y_mm;
    } else {
        penultimate.x_mm = target.x_mm;
    }

    next[0] = source;
    next[next.length - 1] = target;

    return normalizeOrthogonalRoute(next);
}

export function cableLengthMm(points: MmPoint[]): number {
    return points.slice(1).reduce((length, point, index) => {
        const previous = points[index];

        return (
            length +
            Math.hypot(point.x_mm - previous.x_mm, point.y_mm - previous.y_mm)
        );
    }, 0);
}

export function outsideBounds(
    bounds: MmBounds,
    enclosure: {
        width_mm: number;
        height_mm: number;
        margin_left_mm?: number;
        margin_top_mm?: number;
        margin_right_mm?: number;
        margin_bottom_mm?: number;
    },
): boolean {
    return (
        bounds.x_mm < (enclosure.margin_left_mm ?? 0) ||
        bounds.y_mm < (enclosure.margin_top_mm ?? 0) ||
        bounds.x_mm + bounds.width >
            enclosure.width_mm - (enclosure.margin_right_mm ?? 0) ||
        bounds.y_mm + bounds.height >
            enclosure.height_mm - (enclosure.margin_bottom_mm ?? 0)
    );
}

export function moveRouteSegment(
    points: MmPoint[],
    index: number,
    position: MmPoint,
): MmPoint[] {
    const start = points[index];
    const end = points[index + 1];

    if (!start || !end) {
        return points;
    }

    const horizontal = start.y_mm === end.y_mm;
    const movedStart = horizontal
        ? { ...start, y_mm: position.y_mm }
        : { ...start, x_mm: position.x_mm };
    const movedEnd = horizontal
        ? { ...end, y_mm: position.y_mm }
        : { ...end, x_mm: position.x_mm };
    const prefix =
        index === 0
            ? [start, movedStart]
            : [...points.slice(0, index), movedStart];
    const suffix =
        index + 1 === points.length - 1
            ? [movedEnd, end]
            : [movedEnd, ...points.slice(index + 2)];

    return normalizeOrthogonalRoute([...prefix, ...suffix]);
}

export function moveRouteBend(
    points: MmPoint[],
    index: number,
    position: MmPoint,
): MmPoint[] {
    if (index <= 0 || index >= points.length - 1) {
        return points;
    }

    const next = points.map((point) => ({ ...point }));
    const old = next[index];
    const previous = next[index - 1];
    const following = next[index + 1];
    next[index] = position;

    if (index > 1) {
        if (previous.x_mm === old.x_mm) {
            previous.x_mm = position.x_mm;
        } else {
            previous.y_mm = position.y_mm;
        }
    }

    if (index < next.length - 2) {
        if (following.x_mm === old.x_mm) {
            following.x_mm = position.x_mm;
        } else {
            following.y_mm = position.y_mm;
        }
    }

    return normalizeOrthogonalRoute(next);
}

export function addRouteDogleg(
    points: MmPoint[],
    index: number,
    offset: number,
): MmPoint[] {
    const start = points[index];
    const end = points[index + 1];

    if (!start || !end) {
        return points;
    }

    const horizontal = start.y_mm === end.y_mm;
    const first = horizontal
        ? { x_mm: start.x_mm + (end.x_mm - start.x_mm) / 3, y_mm: start.y_mm }
        : { x_mm: start.x_mm, y_mm: start.y_mm + (end.y_mm - start.y_mm) / 3 };
    const last = horizontal
        ? {
              x_mm: start.x_mm + ((end.x_mm - start.x_mm) * 2) / 3,
              y_mm: start.y_mm,
          }
        : {
              x_mm: start.x_mm,
              y_mm: start.y_mm + ((end.y_mm - start.y_mm) * 2) / 3,
          };
    const firstOffset = horizontal
        ? { ...first, y_mm: first.y_mm + offset }
        : { ...first, x_mm: first.x_mm + offset };
    const lastOffset = horizontal
        ? { ...last, y_mm: last.y_mm + offset }
        : { ...last, x_mm: last.x_mm + offset };

    return normalizeOrthogonalRoute([
        ...points.slice(0, index + 1),
        first,
        firstOffset,
        lastOffset,
        last,
        ...points.slice(index + 1),
    ]);
}

export function removeRouteBend(points: MmPoint[], index: number): MmPoint[] {
    if (index <= 0 || index >= points.length - 1) {
        return points;
    }

    const other = index < points.length - 2 ? index + 1 : index - 1;
    const reduced = normalizeOrthogonalRoute(
        points.filter(
            (_, candidate) =>
                candidate !== index && (candidate !== other || other === 0),
        ),
    );

    for (let current = 1; current < reduced.length - 1; current++) {
        const before = reduced[current - 1];
        const after = reduced[current + 1];

        if (before.x_mm === after.x_mm && before.y_mm === after.y_mm) {
            reduced.splice(current, 2);
            current = Math.max(0, current - 2);
        }
    }

    return normalizeOrthogonalRoute(reduced);
}

export function terminalPoint(
    component: PlacedComponent,
    definition: ComponentDefinition,
    terminal: TerminalDefinition | string,
): MmPoint {
    const pin =
        typeof terminal === 'string'
            ? definition.terminals.find(
                  (candidate) => candidate.key === terminal,
              )
            : terminal;

    if (!pin) {
        throw new Error(
            `Terminal ${String(terminal)} is missing from ${definition.display_name}.`,
        );
    }

    const rotated = rotatePoint(
        pin,
        definition.width_mm,
        definition.height_mm,
        component.rotation,
    );

    return {
        x_mm: component.x_mm + rotated.x_mm,
        y_mm: component.y_mm + rotated.y_mm,
    };
}

export function componentBounds(
    component: PlacedComponent,
    definition: ComponentDefinition,
): MmBounds {
    return {
        x_mm: component.x_mm,
        y_mm: component.y_mm,
        ...rotatedBounds(
            definition.width_mm,
            definition.height_mm,
            component.rotation,
        ),
    };
}

export function rerouteConnections(layout: LightingLayout): LightingLayout {
    return {
        ...layout,
        connections: layout.connections.map((connection) => {
            const source = layout.components.find(
                (component) =>
                    component.portable_id === connection.source_portable_id,
            );
            const target = layout.components.find(
                (component) =>
                    component.portable_id === connection.target_portable_id,
            );
            const sourceDefinition = layout.definitions.find(
                (definition) =>
                    definition.id === source?.component_definition_id,
            );
            const targetDefinition = layout.definitions.find(
                (definition) =>
                    definition.id === target?.component_definition_id,
            );

            if (!source || !target || !sourceDefinition || !targetDefinition) {
                return connection;
            }

            const sourcePoint = terminalPoint(
                source,
                sourceDefinition,
                connection.source_terminal,
            );
            const targetPoint = terminalPoint(
                target,
                targetDefinition,
                connection.target_terminal,
            );
            const firstPoint = connection.route_points[0];
            const lastPoint = connection.route_points.at(-1);
            const samePoint = (left: MmPoint | undefined, right: MmPoint) =>
                left !== undefined &&
                Math.round(left.x_mm * 100) === Math.round(right.x_mm * 100) &&
                Math.round(left.y_mm * 100) === Math.round(right.y_mm * 100);

            if (
                samePoint(firstPoint, sourcePoint) &&
                samePoint(lastPoint, targetPoint)
            ) {
                return connection;
            }

            return {
                ...connection,
                route_points: updateRouteEndpoints(
                    connection.route_points,
                    sourcePoint,
                    targetPoint,
                ),
            };
        }),
    };
}

export function reconcileRailAttachments(
    layout: LightingLayout,
): LightingLayout {
    return {
        ...layout,
        components: layout.components.map((component) => {
            if (!component.rail_portable_id) {
                return component;
            }

            const rail = layout.rails.find(
                (candidate) =>
                    candidate.portable_id === component.rail_portable_id,
            );
            const definition = layout.definitions.find(
                (candidate) =>
                    candidate.id === component.component_definition_id,
            );

            if (
                !rail ||
                !definition ||
                definition.mounting_type !== 'din-rail' ||
                component.rotation % 180 !== 0 ||
                component.x_mm < rail.x_mm ||
                component.x_mm + definition.width_mm >
                    rail.x_mm + rail.length_mm
            ) {
                return { ...component, rail_portable_id: null };
            }

            const anchor = rotatePoint(
                {
                    x_mm:
                        definition.mounting_anchor_x_mm ??
                        definition.width_mm / 2,
                    y_mm:
                        definition.mounting_anchor_y_mm ??
                        definition.height_mm / 2,
                },
                definition.width_mm,
                definition.height_mm,
                component.rotation,
            );

            return {
                ...component,
                y_mm: rail.y_mm + rail.width_mm / 2 - anchor.y_mm,
            };
        }),
    };
}

export function snapComponentToRail(
    component: PlacedComponent,
    definition: ComponentDefinition,
    layout: LightingLayout,
    tolerance = 5,
): PlacedComponent {
    if (
        definition.mounting_type !== 'din-rail' ||
        component.rotation % 180 !== 0
    ) {
        return { ...component, rail_portable_id: null };
    }

    const anchor = rotatePoint(
        {
            x_mm: definition.mounting_anchor_x_mm ?? definition.width_mm / 2,
            y_mm: definition.mounting_anchor_y_mm ?? definition.height_mm / 2,
        },
        definition.width_mm,
        definition.height_mm,
        component.rotation,
    );
    const rail = layout.rails
        .filter(
            (candidate) =>
                component.x_mm >= candidate.x_mm &&
                component.x_mm + definition.width_mm <=
                    candidate.x_mm + candidate.length_mm,
        )
        .map((candidate) => ({
            candidate,
            distance: Math.abs(
                component.y_mm +
                    anchor.y_mm -
                    (candidate.y_mm + candidate.width_mm / 2),
            ),
        }))
        .filter(({ distance }) => distance <= tolerance)
        .sort((left, right) => left.distance - right.distance)[0]?.candidate;

    return rail
        ? {
              ...component,
              y_mm: rail.y_mm + rail.width_mm / 2 - anchor.y_mm,
              rail_portable_id: rail.portable_id,
          }
        : { ...component, rail_portable_id: null };
}

export function moveLayoutObject(
    layout: LightingLayout,
    selection: LightingSelection,
    point: MmPoint,
    options: { snap?: boolean } = {},
): LightingLayout {
    if (!selection || !['component', 'rail', 'duct'].includes(selection.type)) {
        return layout;
    }

    const position =
        (options.snap ?? layout.design.snap_to_grid)
            ? snapPoint(point, layout.design.grid_size_mm)
            : point;
    let next = layout;

    if (selection.type === 'component') {
        next = {
            ...layout,
            components: layout.components.map((component) => {
                if (component.portable_id !== selection.id) {
                    return component;
                }

                const definition = layout.definitions.find(
                    (item) => item.id === component.component_definition_id,
                );
                const moved = { ...component, ...position };

                return definition
                    ? snapComponentToRail(moved, definition, layout)
                    : moved;
            }),
        };
    } else if (selection.type === 'rail') {
        const rail = layout.rails.find(
            (candidate) => candidate.portable_id === selection.id,
        );

        if (!rail) {
            return layout;
        }

        const delta = {
            x_mm: position.x_mm - rail.x_mm,
            y_mm: position.y_mm - rail.y_mm,
        };
        next = {
            ...layout,
            rails: layout.rails.map((candidate) =>
                candidate.portable_id === rail.portable_id
                    ? { ...candidate, ...position }
                    : candidate,
            ),
            components: layout.components.map((component) =>
                component.rail_portable_id === rail.portable_id
                    ? {
                          ...component,
                          x_mm: component.x_mm + delta.x_mm,
                          y_mm: component.y_mm + delta.y_mm,
                      }
                    : component,
            ),
        };
    } else {
        next = {
            ...layout,
            ducts: layout.ducts.map((duct) =>
                duct.portable_id === selection.id
                    ? { ...duct, ...position }
                    : duct,
            ),
        };
    }

    return rerouteConnections(next);
}

export function orthogonalRoutePath(points: MmPoint[]): string {
    return points
        .map((point, index) => {
            const canvas = mmPointToCanvas(point);

            return `${index === 0 ? 'M' : 'L'} ${canvas.x} ${canvas.y}`;
        })
        .join(' ');
}
