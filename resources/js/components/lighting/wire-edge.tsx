import {
    BaseEdge,
    EdgeLabelRenderer,
    useReactFlow,
    useViewport,
} from '@xyflow/react';
import type { Edge, EdgeProps } from '@xyflow/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
    addRouteDogleg,
    cableLengthMm,
    canvasPointToMm,
    mmPointToCanvas,
    moveRouteBend,
    moveRouteSegment,
    orthogonalRoutePath,
    removeRouteBend,
    snapPoint,
} from './geometry';
import type { DesignConnection, MmPoint } from './types';

export type PhysicalWireEdge = Edge<
    {
        connection: DesignConnection;
        gridSize: number;
        snap: boolean;
        showLabels: boolean;
        onRoute: (points: MmPoint[], commit: boolean) => void;
    },
    'wire'
>;

export default function WireEdge({
    id,
    data,
    selected,
}: EdgeProps<PhysicalWireEdge>) {
    const { screenToFlowPosition } = useReactFlow();
    const { zoom } = useViewport();

    if (!data) {
        return null;
    }

    const { connection, onRoute, gridSize, snap, showLabels } = data;
    const points = connection.route_points;
    const path = orthogonalRoutePath(points);
    const middle = points[Math.floor(points.length / 2)];
    const label = middle ? mmPointToCanvas(middle) : { x: 0, y: 0 };
    const length = (cableLengthMm(points) / 1000).toFixed(2);
    const caption = `${connection.cable_type} · ${connection.conductor_count} conductor${connection.conductor_count === 1 ? '' : 's'}${connection.gauge ? ` · ${connection.gauge}` : ''} · ${length} m`;

    function drag(
        event: ReactPointerEvent<SVGCircleElement>,
        index: number,
        kind: 'bend' | 'segment',
    ) {
        event.stopPropagation();
        const initial = points.map((point) => ({ ...point }));
        const origin = { x: event.clientX, y: event.clientY };
        let latest = initial;
        let moved = false;

        function move(pointer: PointerEvent) {
            if (
                !moved &&
                Math.hypot(
                    pointer.clientX - origin.x,
                    pointer.clientY - origin.y,
                ) < 3
            ) {
                return;
            }

            moved = true;
            let position = canvasPointToMm(
                screenToFlowPosition({
                    x: pointer.clientX,
                    y: pointer.clientY,
                }),
            );

            if (snap) {
                position = snapPoint(position, gridSize);
            }

            latest =
                kind === 'bend'
                    ? moveRouteBend(initial, index, position)
                    : moveRouteSegment(initial, index, position);
            onRoute(latest, false);
        }

        function finish() {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);

            if (moved) {
                onRoute(latest, true);
            }
        }

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finish, { once: true });
        window.addEventListener('pointercancel', finish, { once: true });
    }

    return (
        <>
            <BaseEdge
                id={id}
                data-testid={`lighting-wire-${connection.portable_id}`}
                path={path}
                interactionWidth={20}
                style={{
                    stroke: selected
                        ? 'var(--primary)'
                        : (connection.color ?? '#64748b'),
                    strokeWidth: selected ? 5 : 3,
                }}
            />
            <title>{caption}</title>
            {selected && (
                <g
                    className="nodrag nopan pointer-events-auto"
                    style={{ pointerEvents: 'all' }}
                    data-testid="wire-route-controls"
                    onClick={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => event.stopPropagation()}
                >
                    {points.slice(1, -1).map((point, index) => {
                        const canvas = mmPointToCanvas(point);

                        return (
                            <circle
                                key={`bend-${index}`}
                                cx={canvas.x}
                                cy={canvas.y}
                                r={Math.max(7, 5 / zoom)}
                                className="cursor-move fill-background stroke-primary stroke-2"
                                role="button"
                                style={{ pointerEvents: 'all' }}
                                aria-label={`Move bend ${index + 1}`}
                                data-testid={`lighting-wire-bend-${connection.portable_id}-${index + 1}`}
                                onPointerDown={(event) =>
                                    drag(event, index + 1, 'bend')
                                }
                                onContextMenu={(event) => {
                                    event.preventDefault();
                                    onRoute(
                                        removeRouteBend(points, index + 1),
                                        true,
                                    );
                                }}
                            >
                                <title>Drag bend · right-click to remove</title>
                            </circle>
                        );
                    })}
                    {points.slice(0, -1).map((point, index) => {
                        const end = points[index + 1];
                        const center = mmPointToCanvas({
                            x_mm: (point.x_mm + end.x_mm) / 2,
                            y_mm: (point.y_mm + end.y_mm) / 2,
                        });

                        return (
                            <circle
                                key={`segment-${index}`}
                                cx={center.x}
                                cy={center.y}
                                r={Math.max(5, 4 / zoom)}
                                className="cursor-move fill-primary/70 stroke-background stroke-2"
                                role="button"
                                style={{ pointerEvents: 'all' }}
                                aria-label={`Move wire segment ${index + 1}`}
                                data-testid={`lighting-wire-segment-${connection.portable_id}-${index}`}
                                onPointerDown={(event) =>
                                    drag(event, index, 'segment')
                                }
                                onDoubleClick={(event) => {
                                    event.stopPropagation();
                                    onRoute(
                                        addRouteDogleg(
                                            points,
                                            index,
                                            gridSize * 2,
                                        ),
                                        true,
                                    );
                                }}
                            >
                                <title>
                                    Drag segment · double-click to add a dogleg
                                </title>
                            </circle>
                        );
                    })}
                </g>
            )}
            {(selected || showLabels) && (
                <EdgeLabelRenderer>
                    <div
                        className="nodrag nopan pointer-events-none absolute rounded border border-border bg-background/90 px-1.5 py-0.5 text-[11px] text-foreground"
                        style={{
                            transform: `translate(-50%, -150%) translate(${label.x}px, ${label.y}px)`,
                            fontSize: Math.max(11, 9 / zoom),
                        }}
                    >
                        {connection.cable_type} · {length} m
                    </div>
                </EdgeLabelRenderer>
            )}
        </>
    );
}
