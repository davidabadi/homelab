import { useReactFlow, useViewport } from '@xyflow/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
    addRouteDogleg,
    canvasPointToMm,
    mmPointToCanvas,
    moveRouteBend,
    moveRouteSegment,
    removeRouteBend,
    snapPoint,
} from './geometry';
import type { MmPoint } from './types';

export function RouteControls({
    points,
    gridSize,
    snap,
    onRoute,
    testId,
    objectId,
    label = 'route',
}: {
    points: MmPoint[];
    gridSize: number;
    snap: boolean;
    onRoute: (points: MmPoint[], commit: boolean) => void;
    testId: string;
    objectId: string;
    label?: string;
}) {
    const { screenToFlowPosition } = useReactFlow();
    const { zoom } = useViewport();

    function drag(
        event: ReactPointerEvent<SVGCircleElement>,
        index: number,
        kind: 'bend' | 'segment',
    ) {
        event.stopPropagation();
        event.preventDefault();
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

        function cancel(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                event.preventDefault();
                finish({ type: 'pointercancel' });
            }
        }

        function finish(pointer: Pick<PointerEvent, 'type'>) {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', finish);
            window.removeEventListener('pointercancel', finish);
            window.removeEventListener('keydown', cancel);

            if (moved) {
                onRoute(
                    pointer.type === 'pointercancel' ? initial : latest,
                    pointer.type !== 'pointercancel',
                );
            }
        }

        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', finish, { once: true });
        window.addEventListener('pointercancel', finish, { once: true });
        window.addEventListener('keydown', cancel);
    }

    return (
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
                        aria-label={`Move ${label} bend ${index + 1}`}
                        data-testid={`${testId}-bend-${objectId}-${index + 1}`}
                        onPointerDown={(event) =>
                            drag(event, index + 1, 'bend')
                        }
                        onContextMenu={(event) => {
                            event.preventDefault();
                            onRoute(removeRouteBend(points, index + 1), true);
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
                        aria-label={`Move ${label} segment ${index + 1}`}
                        data-testid={`${testId}-segment-${objectId}-${index}`}
                        onPointerDown={(event) => drag(event, index, 'segment')}
                        onDoubleClick={(event) => {
                            event.stopPropagation();
                            onRoute(
                                addRouteDogleg(points, index, gridSize * 2),
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
    );
}
